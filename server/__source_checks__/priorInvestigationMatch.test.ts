import { describe, it, expect } from "vitest";
import * as fs from "fs";

describe("BUG-4: fetchPriorInvestigations limit removal", () => {
  const source = fs.readFileSync(
    "server/agenticPipeline/correlationAgent.ts",
    "utf-8"
  );

  it("does not have a LIMIT on the active sessions query", () => {
    // Extract the fetchPriorInvestigations function body
    const fnMatch = source.match(
      /async function fetchPriorInvestigations[\s\S]*?^}/m
    );
    expect(fnMatch).toBeTruthy();
    const fnBody = fnMatch![0];

    // The query should NOT contain .limit(<number>) before the .filter(
    // that does entity-overlap matching in memory.
    expect(fnBody).not.toMatch(/\.limit\(\d+\)[\s\S]*?\.filter\(/);
  });

  it("still applies .slice(0, 10) to cap the final result set", () => {
    const fnMatch = source.match(
      /async function fetchPriorInvestigations[\s\S]*?^}/m
    );
    expect(fnMatch).toBeTruthy();
    const fnBody = fnMatch![0];

    // The function should still cap results after in-memory filtering
    expect(fnBody).toMatch(/\.slice\(0,\s*10\)/);
  });

  it("filters only active sessions (status = 'active')", () => {
    const fnMatch = source.match(
      /async function fetchPriorInvestigations[\s\S]*?^}/m
    );
    expect(fnMatch).toBeTruthy();
    const fnBody = fnMatch![0];

    // Must still have the active-status filter (CR-8)
    expect(fnBody).toMatch(/eq\(investigationSessions\.status,\s*["']active["']\)/);
  });
});
