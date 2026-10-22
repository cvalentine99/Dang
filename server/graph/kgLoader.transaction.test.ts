/**
 * kgLoader transaction + upsert behaviour (H-D1, CODE_REVIEW_2026-10-21 §5.4).
 *
 * Uses an in-memory recording SqlExecutor — no database required.
 */
import { describe, it, expect } from "vitest";
import { loadLayer, withTransaction, type SqlExecutor } from "./kgLoader";
import type { KgExtractionResult } from "./kgTypes";

function makeData(): KgExtractionResult {
  return {
    specTitle: "t",
    specVersion: "4.14.4",
    endpoints: [
      {
        endpoint_id: "GET:/agents", path: "/agents", method: "GET", summary: "s", description: "d",
        tags: "[]", operation_id: "op", resource: "agents", operation_type: "READ", risk_level: "SAFE",
        allowed_for_llm: 1, auth_method: "jwt", trust_score: "1.0", deprecated: 0,
      },
    ],
    parameters: [{ endpoint_id: "GET:/agents", name: "limit", location: "query", required: 0, param_type: "integer", description: "" }],
    responses: [],
    authMethods: [],
    resources: [],
    useCases: [],
    indices: [],
    fields: [],
    errorPatterns: [],
  } as unknown as KgExtractionResult;
}

interface Recorder {
  log: string[];
  exec: SqlExecutor;
}

function makeExec(opts: { failOn?: RegExp; withTx?: boolean } = {}): Recorder {
  const log: string[] = [];
  const run = (scope: string) => async (sql: string) => {
    log.push(`${scope}:${sql}`);
    if (opts.failOn && opts.failOn.test(sql)) throw new Error("boom");
    if (sql.startsWith("UPDATE `kg_sync_status`")) return [{ affectedRows: 1 }];
    if (sql.startsWith("INSERT INTO `kg_endpoints`")) return [{ insertId: 42 }];
    return [{ affectedRows: 1 }];
  };
  const exec: SqlExecutor = { execute: run("pool") };
  if (opts.withTx !== false) {
    exec.transaction = async <T,>(fn: (tx: SqlExecutor) => Promise<T>) => {
      log.push("BEGIN");
      try {
        const r = await fn({ execute: run("tx") });
        log.push("COMMIT");
        return r;
      } catch (e) {
        log.push("ROLLBACK");
        throw e;
      }
    };
  }
  return { log, exec };
}

describe("kgLoader — H-D1 transactional layer load", () => {
  it("runs truncate + insert on the transaction executor and commits", async () => {
    const { log, exec } = makeExec();
    const res = await loadLayer(exec, makeData(), "api_ontology");
    expect(res.status).toBe("completed");
    const begin = log.indexOf("BEGIN");
    const commit = log.indexOf("COMMIT");
    expect(begin).toBeGreaterThan(-1);
    expect(commit).toBeGreaterThan(begin);
    // Every data statement happens inside the transaction
    const dataStmts = log.filter(l => /DELETE FROM|INSERT INTO `kg_(endpoints|parameters)`/.test(l));
    expect(dataStmts.length).toBeGreaterThan(0);
    expect(dataStmts.every(l => l.startsWith("tx:"))).toBe(true);
    // Sync-status bookkeeping stays outside so "syncing" is visible
    expect(log.filter(l => l.includes("kg_sync_status")).every(l => l.startsWith("pool:"))).toBe(true);
  });

  it("upserts kg_endpoints on (path, method) instead of wiping the table", async () => {
    const { log, exec } = makeExec();
    await loadLayer(exec, makeData(), "api_ontology");
    expect(log).not.toContain("tx:DELETE FROM `kg_endpoints`");
    const upsert = log.find(l => l.startsWith("tx:INSERT INTO `kg_endpoints`"));
    expect(upsert).toContain("ON DUPLICATE KEY UPDATE `id` = LAST_INSERT_ID(`id`)");
    // runtime-owned trust columns are not overwritten
    expect(upsert!.split("ON DUPLICATE KEY UPDATE")[1]).not.toContain("trust_score");
    // children are still fully reloaded
    expect(log).toContain("tx:DELETE FROM `kg_parameters`");
    // only endpoints not in the spec are deleted, after the children are re-inserted
    const stale = log.findIndex(l => l.startsWith("tx:DELETE FROM `kg_endpoints` WHERE `id` NOT IN"));
    const params = log.findIndex(l => l.startsWith("tx:INSERT INTO `kg_parameters`"));
    expect(stale).toBeGreaterThan(params);
  });

  it("rolls back and reports error when a statement fails mid-layer", async () => {
    const { log, exec } = makeExec({ failOn: /^INSERT INTO `kg_parameters`/ });
    const res = await loadLayer(exec, makeData(), "api_ontology");
    expect(res.status).toBe("error");
    expect(res.errorMessage).toBe("boom");
    expect(log).toContain("ROLLBACK");
    expect(log).not.toContain("COMMIT");
  });

  it("fails closed when the executor cannot provide a transaction", async () => {
    const { exec } = makeExec({ withTx: false });
    const res = await loadLayer(exec, makeData(), "error_graph");
    expect(res.status).toBe("error");
    expect(res.errorMessage).toMatch(/does not support transactions/);
  });

  it("uses beginTransaction/commit/rollback on a single mysql2 Connection", async () => {
    const calls: string[] = [];
    const conn = {
      execute: async () => [{}],
      beginTransaction: async () => { calls.push("begin"); },
      commit: async () => { calls.push("commit"); },
      rollback: async () => { calls.push("rollback"); },
    };
    await withTransaction(conn, async () => 1);
    await expect(withTransaction(conn, async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(calls).toEqual(["begin", "commit", "begin", "rollback"]);
  });
});
