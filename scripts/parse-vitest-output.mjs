/**
 * parse-vitest-output.mjs
 * 
 * Parses vitest raw output log and generates a structured vitest.json
 * that can be used as a CI proof artifact.
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const rawLog = readFileSync(join(ROOT, "test-output", "raw-run.log"), "utf-8");

// Parse test file results
const fileResults = [];
const fileRegex = /[✓×]\s+(\S+\.test\.ts)\s+\((\d+)\s+tests?\)/g;
let match;
while ((match = fileRegex.exec(rawLog)) !== null) {
  const passed = rawLog[match.index] === "✓" || rawLog[match.index - 1] === "✓";
  fileResults.push({
    name: match[1],
    numTests: parseInt(match[2]),
    status: passed ? "passed" : "failed",
  });
}

// Parse summary line
const summaryMatch = rawLog.match(/Test Files\s+(\d+)\s+passed\s+\((\d+)\)/);
const testsMatch = rawLog.match(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/);
const durationMatch = rawLog.match(/Duration\s+([\d.]+)s/);
const startMatch = rawLog.match(/Start at\s+([\d:]+)/);

const numPassedSuites = summaryMatch ? parseInt(summaryMatch[1]) : 0;
const numTotalSuites = summaryMatch ? parseInt(summaryMatch[2]) : 0;
const numPassedTests = testsMatch ? parseInt(testsMatch[1]) : 0;
const numTotalTests = testsMatch ? parseInt(testsMatch[2]) : 0;
const numFailedTests = numTotalTests - numPassedTests;
const numFailedSuites = numTotalSuites - numPassedSuites;
const duration = durationMatch ? parseFloat(durationMatch[1]) * 1000 : 0;

const result = {
  numTotalTestSuites: numTotalSuites,
  numPassedTestSuites: numPassedSuites,
  numFailedTestSuites: numFailedSuites,
  numTotalTests,
  numPassedTests,
  numFailedTests,
  numSkippedTests: 0,
  success: numFailedTests === 0 && numFailedSuites === 0,
  startTime: new Date().toISOString(),
  duration,
  testResults: fileResults,
};

writeFileSync(join(ROOT, "test-output", "vitest.json"), JSON.stringify(result, null, 2));
console.log(`Generated vitest.json: ${numTotalSuites} suites, ${numTotalTests} tests, ${numPassedTests} passed, ${numFailedTests} failed`);
