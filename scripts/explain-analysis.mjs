/**
 * EXPLAIN Analysis — Composite Index Verification
 *
 * Runs EXPLAIN on all queries that should benefit from the 4 new composite indexes:
 *   1. aq_status_ruleLevel_idx  (alert_queue: status, ruleLevel)
 *   2. aq_status_queuedAt_idx   (alert_queue: status, queuedAt)
 *   3. pr_status_startedAt_idx  (pipeline_runs: status, startedAt)
 *   4. pr_queueItemId_startedAt_idx (pipeline_runs: queueItemId, startedAt)
 */
import mysql from "mysql2/promise";

const url = new URL(process.env.DATABASE_URL);
const pool = mysql.createPool({
  host: url.hostname,
  port: Number(url.port),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

const results = [];

async function explain(label, query, params = []) {
  const [rows] = await pool.execute(`EXPLAIN ${query}`, params);
  const row = rows[0];
  results.push({
    label,
    query: query.replace(/\s+/g, " ").trim(),
    table: row.table,
    type: row.type,
    possible_keys: row.possible_keys,
    key: row.key,
    key_len: row.key_len,
    ref: row.ref,
    rows: row.rows,
    filtered: row.filtered,
    extra: row.Extra,
  });
  return row;
}

try {
  // ═══════════════════════════════════════════════════════════════════════════
  // alert_queue QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  // Q1: alertQueue.list — main listing with priority sort
  // ORDER BY FIELD(status, ...), ruleLevel DESC, queuedAt ASC LIMIT 20
  await explain(
    "Q1: alertQueue.list (priority sort, LIMIT 20)",
    `SELECT * FROM alert_queue
     ORDER BY FIELD(status, 'processing', 'queued', 'completed', 'failed', 'dismissed'),
              ruleLevel DESC, queuedAt ASC
     LIMIT 20`
  );

  // Q2: alertQueue.count — active queue depth
  // WHERE status IN ('queued', 'processing')
  await explain(
    "Q2: alertQueue.count (active queue depth)",
    `SELECT COUNT(*) as count FROM alert_queue
     WHERE status IN ('queued', 'processing')`
  );

  // Q3: alertQueue eviction — find lowest priority queued item
  // WHERE status = 'queued' ORDER BY ruleLevel ASC, queuedAt ASC LIMIT 1
  await explain(
    "Q3: alertQueue eviction (lowest priority queued)",
    `SELECT id, ruleLevel FROM alert_queue
     WHERE status = 'queued'
     ORDER BY ruleLevel ASC, queuedAt ASC
     LIMIT 1`
  );

  // Q4: alertQueue.recentActivity — recent alerts by severity
  // WHERE queuedAt >= ? AND status IN ('queued', 'processing')
  // ORDER BY ruleLevel DESC, queuedAt DESC LIMIT 10
  await explain(
    "Q4: alertQueue.recentActivity (recent alerts by severity)",
    `SELECT * FROM alert_queue
     WHERE queuedAt >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       AND status IN ('queued', 'processing')
     ORDER BY ruleLevel DESC, queuedAt DESC
     LIMIT 10`
  );

  // Q5: alertQueue.clearHistory — delete completed/failed/dismissed
  await explain(
    "Q5: alertQueue.clearHistory (delete non-active)",
    `SELECT * FROM alert_queue
     WHERE status IN ('completed', 'failed', 'dismissed')`
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // pipeline_runs QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  // Q6: pipeline.listPipelineRuns — unfiltered, ORDER BY startedAt DESC
  await explain(
    "Q6: pipeline.listRuns (unfiltered, ORDER BY startedAt DESC)",
    `SELECT * FROM pipeline_runs
     ORDER BY startedAt DESC
     LIMIT 25`
  );

  // Q7: pipeline.listPipelineRuns — filtered by status
  await explain(
    "Q7: pipeline.listRuns (filtered by status='completed')",
    `SELECT * FROM pipeline_runs
     WHERE status = 'completed'
     ORDER BY startedAt DESC
     LIMIT 25`
  );

  // Q8: splunk queueItemId lookup — find latest run for a queue item
  await explain(
    "Q8: splunk queueItemId lookup (latest run for queue item)",
    `SELECT id, triageId FROM pipeline_runs
     WHERE queueItemId = 1
     ORDER BY startedAt DESC
     LIMIT 1`
  );

  // Q9: pipeline.pipelineRunStats — aggregate stats (no WHERE, full scan expected)
  await explain(
    "Q9: pipeline.pipelineRunStats (aggregate, full scan expected)",
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) as partial,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
            AVG(totalLatencyMs) as avgLatencyMs
     FROM pipeline_runs`
  );

  // Q10: pipeline.listPipelineRuns — COUNT with status filter
  await explain(
    "Q10: pipeline.listRuns COUNT (filtered by status='failed')",
    `SELECT COUNT(*) as count FROM pipeline_runs
     WHERE status = 'failed'`
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORT
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("\n" + "═".repeat(120));
  console.log("EXPLAIN ANALYSIS REPORT — Composite Index Verification");
  console.log("═".repeat(120));

  const targetIndexes = {
    "aq_status_ruleLevel_idx": "alert_queue (status, ruleLevel)",
    "aq_status_queuedAt_idx": "alert_queue (status, queuedAt)",
    "pr_status_startedAt_idx": "pipeline_runs (status, startedAt)",
    "pr_queueItemId_startedAt_idx": "pipeline_runs (queueItemId, startedAt)",
  };

  for (const r of results) {
    const usesComposite = r.key && Object.keys(targetIndexes).some(k => r.key.includes(k));
    const usesAnyIndex = r.key && r.key !== "NULL";
    const verdict = usesComposite ? "✅ COMPOSITE" : usesAnyIndex ? "⚠️  OTHER INDEX" : "❌ FULL SCAN";

    console.log(`\n┌─ ${r.label}`);
    console.log(`│  SQL: ${r.query.substring(0, 100)}${r.query.length > 100 ? "..." : ""}`);
    console.log(`│  type: ${r.type} | key: ${r.key || "NULL"} | key_len: ${r.key_len || "N/A"}`);
    console.log(`│  possible_keys: ${r.possible_keys || "NULL"}`);
    console.log(`│  rows: ${r.rows} | filtered: ${r.filtered}% | Extra: ${r.extra}`);
    console.log(`└─ Verdict: ${verdict}`);
  }

  // Summary
  console.log("\n" + "═".repeat(120));
  console.log("SUMMARY");
  console.log("═".repeat(120));

  const compositeUsed = results.filter(r => r.key && Object.keys(targetIndexes).some(k => r.key.includes(k)));
  const otherIndex = results.filter(r => r.key && r.key !== "NULL" && !Object.keys(targetIndexes).some(k => r.key.includes(k)));
  const fullScans = results.filter(r => !r.key || r.key === "NULL");

  console.log(`Total queries analyzed: ${results.length}`);
  console.log(`✅ Using composite index: ${compositeUsed.length} (${compositeUsed.map(r => r.label.split(":")[0]).join(", ")})`);
  console.log(`⚠️  Using other index: ${otherIndex.length} (${otherIndex.map(r => r.label.split(":")[0]).join(", ")})`);
  console.log(`❌ Full table scan: ${fullScans.length} (${fullScans.map(r => r.label.split(":")[0]).join(", ")})`);

  // Check which composite indexes are used at least once
  console.log("\nComposite Index Usage:");
  for (const [idx, desc] of Object.entries(targetIndexes)) {
    const used = results.some(r => r.key && r.key.includes(idx));
    console.log(`  ${used ? "✅" : "❌"} ${idx} — ${desc} ${used ? "(USED)" : "(NOT USED BY ANY QUERY)"}`);
  }

  // Write JSON results for test consumption
  const fs = await import("fs");
  fs.writeFileSync("/tmp/explain-results.json", JSON.stringify(results, null, 2));
  console.log("\nFull results saved to /tmp/explain-results.json");

} catch (err) {
  console.error("Error:", err.message);
} finally {
  await pool.end();
}
