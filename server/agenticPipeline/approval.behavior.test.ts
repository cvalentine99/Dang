/**
 * Response-action approval workflow behavior (H-T3) — DB-gated.
 *
 * Drives appRouter.responseActions.* through createCaller against the migrated
 * test database: the real state machine, optimistic-concurrency UPDATE and
 * audit writes run. Actors are the fixture users seeded by testDb.ts
 * (id 1 = admin, id 2 = user).
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../routers";
import { getDb, getUserByOpenId } from "../db";
import {
  investigationSessions,
  livingCaseState,
  responseActionAudit,
  responseActions,
  type User,
} from "../../drizzle/schema";
import { responseActionsRouter } from "./responseActionsRouter";
import { describeWithDb } from "../testHelpers/requireDb";
import { makeTrpcContext } from "../testHelpers/trpcContext";

const createdActionIds: string[] = [];
const createdSessionIds: number[] = [];
const createdCaseIds: number[] = [];

/** True once bulkApprove's input schema carries a required caseId (other Phase 2 work). */
function bulkApproveRequiresCaseId(): boolean {
  const proc = responseActionsRouter._def.procedures.bulkApprove as unknown as {
    _def: { inputs: Array<{ safeParse: (v: unknown) => { success: boolean } }> };
  };
  const schema = proc._def.inputs[0];
  if (!schema) return false;
  // Accepted without caseId → caseId is not required yet.
  return !schema.safeParse({ actionIds: ["ra-x"] }).success && schema.safeParse({ actionIds: ["ra-x"], caseId: 1 }).success;
}

async function captureError(p: Promise<unknown>): Promise<TRPCError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    return err as TRPCError;
  }
  throw new Error("expected the call to throw");
}

describeWithDb("responseActions: propose → approve → acknowledge (real DB)", () => {
  let admin: User;
  let analyst: User;

  beforeAll(async () => {
    admin = (await getUserByOpenId("test-fixture-admin"))!;
    analyst = (await getUserByOpenId("test-fixture-user"))!;
    expect(admin?.role).toBe("admin");
    expect(analyst?.role).toBe("user");
  });

  /** A real case (investigation session + living_case_state row) owned by the admin fixture. */
  async function createCase(label: string): Promise<number> {
    const db = (await getDb())!;
    const [session] = await db
      .insert(investigationSessions)
      .values({ userId: admin.id, title: `approval.behavior ${label}` })
      .$returningId();
    createdSessionIds.push(session.id);
    const [row] = await db
      .insert(livingCaseState)
      .values({ sessionId: session.id, caseData: {} as never })
      .$returningId();
    createdCaseIds.push(row.id);
    return row.id;
  }

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    if (createdActionIds.length) {
      await db.delete(responseActionAudit).where(inArray(responseActionAudit.actionIdStr, createdActionIds));
      await db.delete(responseActions).where(inArray(responseActions.actionId, createdActionIds));
    }
    if (createdCaseIds.length) await db.delete(livingCaseState).where(inArray(livingCaseState.id, createdCaseIds));
    if (createdSessionIds.length)
      await db.delete(investigationSessions).where(inArray(investigationSessions.id, createdSessionIds));
  });

  async function propose(caseId?: number) {
    const caller = appRouter.createCaller(makeTrpcContext({ user: admin }).ctx);
    const res = await caller.responseActions.propose({
      category: "block_ioc",
      title: `behavior-test block 203.0.113.${createdActionIds.length + 1}`,
      targetType: "ip",
      targetValue: `203.0.113.${createdActionIds.length + 1}`,
      requiresApproval: true,
      ...(caseId !== undefined ? { caseId } : {}),
    });
    createdActionIds.push(res.actionId);
    return res;
  }

  it("runs the full lifecycle, requires an outcome to acknowledge, and audits every transition", async () => {
    const caller = appRouter.createCaller(makeTrpcContext({ user: admin }).ctx);
    const { actionId, action } = await propose();
    expect(action.state).toBe("proposed");
    expect(action.proposedBy).toBe(`user:${admin.id}`);

    // Cannot skip approval
    const early = await caller.responseActions.acknowledge({ actionId, outcome: "success", result: "done" });
    expect(early.success).toBe(false);

    const approved = await caller.responseActions.approve({ actionId, reason: "confirmed malicious" });
    expect(approved.success).toBe(true);
    expect(approved.action?.state).toBe("approved");
    expect(approved.action?.approvedBy).toBe(`user:${admin.id}`);

    // outcome and result are mandatory — there is no default success
    const noOutcome = await captureError(
      caller.responseActions.acknowledge({ actionId, result: "blocked" } as unknown as Parameters<
        typeof caller.responseActions.acknowledge
      >[0])
    );
    expect(noOutcome.code).toBe("BAD_REQUEST");
    const blankResult = await captureError(caller.responseActions.acknowledge({ actionId, outcome: "success", result: "   " }));
    expect(blankResult.code).toBe("BAD_REQUEST");

    const acked = await caller.responseActions.acknowledge({
      actionId,
      outcome: "partial",
      result: "Blocked on the perimeter firewall; EDR push pending",
    });
    expect(acked.success).toBe(true);
    expect(acked.action?.state).toBe("acknowledged");
    expect(acked.action?.executionOutcome).toBe("partial");
    expect(acked.action?.executionSuccess).toBe(0); // only a full success counts
    expect(acked.action?.executedBy).toBe(`user:${admin.id}`);

    // Terminal
    const again = await caller.responseActions.approve({ actionId });
    expect(again.success).toBe(false);

    const trail = await caller.responseActions.auditTrail({ actionId });
    const transitions = trail.entries;
    expect(transitions.map((t) => `${t.fromState}->${t.toState}`).sort()).toEqual(
      ["none->proposed", "proposed->approved", "approved->acknowledged"].sort()
    );
  });

  it("non-admins cannot propose, approve or acknowledge", async () => {
    const { actionId } = await propose();
    const caller = appRouter.createCaller(makeTrpcContext({ user: analyst }).ctx);
    expect((await captureError(caller.responseActions.approve({ actionId }))).code).toBe("FORBIDDEN");
    expect(
      (await captureError(caller.responseActions.acknowledge({ actionId, outcome: "success", result: "x" }))).code
    ).toBe("FORBIDDEN");
    expect(
      (await captureError(caller.responseActions.propose({ category: "block_ioc", title: "nope" }))).code
    ).toBe("FORBIDDEN");
  });

  // bulkApprove must be scoped to one case: ids from another case are not approved.
  // Enabled automatically once the router's bulkApprove input requires caseId.
  (bulkApproveRequiresCaseId() ? it : it.todo)("bulkApprove rejects action ids that belong to another case", async () => {
    const CASE_A = await createCase("A");
    const CASE_B = await createCase("B");
    const a = await propose(CASE_A);
    const b = await propose(CASE_B);
    const caller = appRouter.createCaller(makeTrpcContext({ user: admin }).ctx);
    const bulk = caller.responseActions.bulkApprove as unknown as (input: {
      caseId: number;
      actionIds: string[];
    }) => Promise<{ results?: Array<{ actionId: string; success: boolean }> }>;

    let results: Array<{ actionId: string; success: boolean }> | undefined;
    try {
      results = (await bulk({ caseId: CASE_A, actionIds: [a.actionId, b.actionId] })).results;
    } catch (err) {
      // Rejecting the whole request is also acceptable.
      expect(err).toBeInstanceOf(TRPCError);
    }
    if (results) {
      expect(results.find((r) => r.actionId === b.actionId)?.success).toBe(false);
    }

    const fetched = await caller.responseActions.getById({ actionId: b.actionId });
    expect(fetched.found && fetched.action.state).toBe("proposed");
  });
});
