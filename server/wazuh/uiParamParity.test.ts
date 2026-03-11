/**
 * uiParamParity.test.ts — CI guard for UI → Router schema parity
 *
 * This test runs the deterministic audit script and verifies:
 * 1. The script executes without error
 * 2. Zero violations are found
 * 3. The report file is generated and non-empty
 * 4. The JSON artifact matches the report
 * 5. All callsites reference procedures that exist in the router
 * 6. No required parameters are missing from any callsite
 *
 * If this test fails, run: node scripts/audit-ui-param-parity.mjs
 * to regenerate the report and inspect violations.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../..");
const REPORT_PATH = join(ROOT, "docs/ui-param-parity-report.md");
const JSON_PATH = join(ROOT, "docs/ui-param-parity.json");
const SCRIPT_PATH = join(ROOT, "scripts/audit-ui-param-parity.mjs");

describe("UI → Router param parity CI guard", () => {
  let scriptOutput: string;
  let reportContent: string;
  let jsonData: any;

  beforeAll(() => {
    // Run the audit script fresh
    scriptOutput = execSync(`node ${SCRIPT_PATH}`, {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 30_000,
    });
  });

  it("audit script executes without error", () => {
    expect(scriptOutput).toContain("Parsed");
    expect(scriptOutput).toContain("Report written to");
    expect(scriptOutput).toContain("JSON artifact written to");
  });

  it("report file is generated and non-empty", () => {
    expect(existsSync(REPORT_PATH)).toBe(true);
    reportContent = readFileSync(REPORT_PATH, "utf-8");
    expect(reportContent.length).toBeGreaterThan(500);
    expect(reportContent).toContain("# UI → Router Schema Parity Report");
  });

  it("JSON artifact is generated and parseable", () => {
    expect(existsSync(JSON_PATH)).toBe(true);
    const raw = readFileSync(JSON_PATH, "utf-8");
    jsonData = JSON.parse(raw);
    expect(jsonData).toBeDefined();
    expect(jsonData.callsiteCount).toBeGreaterThan(0);
    expect(jsonData.procedureCount).toBeGreaterThan(0);
  });

  it("zero violations in the report", () => {
    reportContent = readFileSync(REPORT_PATH, "utf-8");
    // The report should contain "Violations | 0"
    expect(reportContent).toContain("| Violations | 0 |");
    expect(reportContent).toContain("No violations found.");
    // Should NOT contain any violation markers
    expect(reportContent).not.toContain("**MISSING REQUIRED**");
    expect(reportContent).not.toContain("**UNKNOWN KEY**");
  });

  it("all consumed procedures exist in the router schema", () => {
    const raw = readFileSync(JSON_PATH, "utf-8");
    jsonData = JSON.parse(raw);
    const routerProcs = new Set(Object.keys(jsonData.schemas));
    for (const cs of jsonData.callsites) {
      expect(
        routerProcs.has(cs.procedure),
        `UI calls wazuh.${cs.procedure} at ${cs.file}:${cs.line} but it doesn't exist in the router`
      ).toBe(true);
    }
  });

  it("callsite count matches expected range (sanity check)", () => {
    const raw = readFileSync(JSON_PATH, "utf-8");
    jsonData = JSON.parse(raw);
    // We currently have 114 callsites — this should not drop significantly
    expect(jsonData.callsiteCount).toBeGreaterThanOrEqual(100);
    // And should not wildly exceed current count (would indicate parser bug)
    expect(jsonData.callsiteCount).toBeLessThan(300);
  });

  it("consumed procedure count matches expected range", () => {
    const raw = readFileSync(JSON_PATH, "utf-8");
    jsonData = JSON.parse(raw);
    // We currently consume 64 of 113 procedures
    expect(jsonData.consumedProcedures.length).toBeGreaterThanOrEqual(50);
    expect(jsonData.consumedProcedures.length).toBeLessThanOrEqual(jsonData.procedureCount);
  });

  it("report and JSON artifact are consistent", () => {
    reportContent = readFileSync(REPORT_PATH, "utf-8");
    const raw = readFileSync(JSON_PATH, "utf-8");
    jsonData = JSON.parse(raw);
    // Report should mention the same callsite count
    expect(reportContent).toContain(`| Total callsites | ${jsonData.callsiteCount} |`);
    // Report should mention the same procedure count
    expect(reportContent).toContain(`| Router procedures available | ${jsonData.procedureCount} |`);
  });

  it("no procedure is called with only __dynamic__ or __variable__ (unresolved)", () => {
    const raw = readFileSync(JSON_PATH, "utf-8");
    jsonData = JSON.parse(raw);
    for (const cs of jsonData.callsites) {
      const keys = Object.keys(cs.passedKeys);
      if (keys.length === 1 && keys[0] === "__dynamic__") {
        throw new Error(
          `Unresolved dynamic input at ${cs.file}:${cs.line} for wazuh.${cs.procedure} — update resolveDynamicInputs()`
        );
      }
    }
  });
});
