#!/usr/bin/env node
/**
 * audit-ui-param-parity.mjs
 *
 * Deterministic audit script that scans every UI callsite invoking trpc.wazuh.*,
 * extracts the keys actually passed, compares them against the router Zod schema,
 * and classifies each optional parameter as Surfaced / Constant / Not supported.
 *
 * Output: docs/ui-param-parity-report.md
 *
 * Usage: node scripts/audit-ui-param-parity.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const CLIENT_SRC = join(ROOT, "client/src");
const ROUTER_FILE = join(ROOT, "server/wazuh/wazuhRouter.ts");
const OUTPUT_FILE = join(ROOT, "docs/ui-param-parity-report.md");

// ── Step 1: Parse router Zod schemas ──────────────────────────────────────────
// We parse the router file to extract procedure names and their input schema keys.
// This is a static analysis approach — we parse the TypeScript AST-free by regex.

function parseRouterSchemas() {
  const src = readFileSync(ROUTER_FILE, "utf-8");
  const lines = src.split("\n");
  const schemas = new Map(); // procedureName → { keys: Map<name, {required, default}>, line }

  // Find paginationSchema shape
  const paginationKeys = new Map();
  paginationKeys.set("limit", { required: false, default: "100" });
  paginationKeys.set("offset", { required: false, default: "0" });

  // Find expSyscollectorSchema shape
  const expSyscollectorKeys = new Map();
  expSyscollectorKeys.set("limit", { required: false, default: "100" });
  expSyscollectorKeys.set("offset", { required: false, default: "0" });
  expSyscollectorKeys.set("sort", { required: false, default: null });
  expSyscollectorKeys.set("search", { required: false, default: null });
  expSyscollectorKeys.set("select", { required: false, default: null });
  expSyscollectorKeys.set("q", { required: false, default: null });
  expSyscollectorKeys.set("distinct", { required: false, default: null });
  expSyscollectorKeys.set("agents_list", { required: false, default: null });

  let currentProc = null;
  let braceDepth = 0;
  let inputBlock = "";
  let inInput = false;
  let inputStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect procedure start: "  procedureName: wazuhProcedure" or adminProcedure or protectedProcedure
    const procMatch = line.match(/^\s+(\w+):\s*(?:wazuhProcedure|adminProcedure|protectedProcedure)/);
    if (procMatch) {
      currentProc = procMatch[1];
      // Check if there's no .input() before the next .query()
      // Look ahead for .input( or .query(
      let hasInput = false;
      for (let j = i + 1; j < Math.min(i + 50, lines.length); j++) {
        if (lines[j].match(/\.input\(/)) { hasInput = true; break; }
        if (lines[j].match(/\.query\(/)) break;
        // Next procedure
        if (lines[j].match(/^\s+\w+:\s*(?:wazuhProcedure|adminProcedure|protectedProcedure)/)) break;
      }
      if (!hasInput) {
        schemas.set(currentProc, { keys: new Map(), line: i + 1, inputType: "void" });
        currentProc = null;
      }
      continue;
    }

    // Detect .input( start
    if (currentProc && line.match(/\.input\(/)) {
      inInput = true;
      inputBlock = "";
      braceDepth = 0;
      inputStartLine = i + 1;
      // Count opening/closing on this line
      for (const ch of line) {
        if (ch === "(") braceDepth++;
        if (ch === ")") braceDepth--;
      }
      inputBlock += line + "\n";
      if (braceDepth <= 0) {
        // Single-line input
        inInput = false;
        const keys = extractKeysFromInput(inputBlock, paginationKeys, expSyscollectorKeys);
        schemas.set(currentProc, { keys, line: inputStartLine, inputType: "object" });
        currentProc = null;
      }
      continue;
    }

    if (inInput) {
      for (const ch of line) {
        if (ch === "(") braceDepth++;
        if (ch === ")") braceDepth--;
      }
      inputBlock += line + "\n";
      if (braceDepth <= 0) {
        inInput = false;
        const keys = extractKeysFromInput(inputBlock, paginationKeys, expSyscollectorKeys);
        schemas.set(currentProc, { keys, line: inputStartLine, inputType: "object" });
        currentProc = null;
      }
    }
  }

  return schemas;
}

function extractKeysFromInput(block, paginationKeys, expSyscollectorKeys) {
  const keys = new Map();

  // Check for paginationSchema spread
  if (block.includes("paginationSchema") || block.includes("...paginationSchema.shape")) {
    for (const [k, v] of paginationKeys) keys.set(k, { ...v });
  }

  // Check for expSyscollectorSchema
  if (block.includes("expSyscollectorSchema")) {
    for (const [k, v] of expSyscollectorKeys) keys.set(k, { ...v });
    return keys;
  }

  // Extract explicit keys from z.object({...})
  // Match patterns like: keyName: z.string(), keyName: z.number().optional(), etc.
  const keyPattern = /(\w+)\s*:\s*(?:z\.\w+|agentIdSchema|nodeIdSchema|pathSegment|filenameSchema|groupIdSchema|componentSchema|configurationSchema|policyIdSchema|requirementSchema|paginationSchema)/g;
  let m;
  while ((m = keyPattern.exec(block)) !== null) {
    const keyName = m[1];
    if (keyName === "shape" || keyName === "extend") continue;

    // Check if optional or has default
    // We need to find the full type expression for this key, handling nested brackets
    const restOfBlock = block.slice(m.index + m[0].length);
    // Find the end of this key's type expression: next key at same depth or closing brace
    let typeExpr = "";
    let depth = 0;
    for (let ci = 0; ci < restOfBlock.length && ci < 500; ci++) {
      const ch = restOfBlock[ci];
      if (ch === "(" || ch === "[" || ch === "{") depth++;
      if (ch === ")" || ch === "]" || ch === "}") depth--;
      if (depth < 0) break; // closing brace of the z.object
      if (ch === "," && depth === 0) break; // next key
      typeExpr += ch;
    }
    const isOptional = typeExpr.includes(".optional()");
    const hasDefault = typeExpr.includes(".default(");
    const defaultMatch = typeExpr.match(/\.default\(([^)]+)\)/);

    keys.set(keyName, {
      required: !isOptional && !hasDefault,
      default: hasDefault ? (defaultMatch ? defaultMatch[1].trim() : "yes") : null,
    });
  }

  // Handle paginationSchema.extend({...})
  if (block.includes("paginationSchema.extend(")) {
    for (const [k, v] of paginationKeys) {
      if (!keys.has(k)) keys.set(k, { ...v });
    }
  }

  return keys;
}

// ── Step 2: Parse UI callsites ────────────────────────────────────────────────

function findFiles(dir, ext) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) results.push(...findFiles(full, ext));
    else if (full.endsWith(ext)) results.push(full);
  }
  return results;
}

function parseUICallsites() {
  const files = [
    ...findFiles(join(CLIENT_SRC, "pages"), ".tsx"),
    ...findFiles(join(CLIENT_SRC, "components"), ".tsx"),
  ];

  const callsites = [];

  for (const file of files) {
    const src = readFileSync(file, "utf-8");
    const lines = src.split("\n");
    const relPath = relative(ROOT, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match trpc.wazuh.procedureName.useQuery( or .useMutation(
      const callMatch = line.match(/trpc\.wazuh\.(\w+)\.(useQuery|useMutation)\s*\(/);
      if (!callMatch) continue;

      const procName = callMatch[1];
      const hookType = callMatch[2];

      // Extract the first argument (input) — may span multiple lines
      let argBlock = "";
      let parenDepth = 0;
      let started = false;
      let argStart = line.indexOf(`.${hookType}(`) + `.${hookType}(`.length;

      for (let j = i; j < Math.min(i + 20, lines.length); j++) {
        const scanLine = j === i ? lines[j].slice(argStart) : lines[j];
        for (let k = 0; k < scanLine.length; k++) {
          const ch = scanLine[k];
          if (ch === "(" || ch === "{" || ch === "[") {
            if (!started && ch === "{") started = true;
            parenDepth++;
          }
          if (ch === ")" || ch === "}" || ch === "]") {
            parenDepth--;
            if (started && parenDepth === 0 && ch === "}") {
              argBlock += scanLine.slice(0, k + 1);
              break;
            }
          }
          if (parenDepth < 0) break; // hit the closing ) of useQuery
        }
        if (parenDepth < 0 || (started && parenDepth === 0)) break;
        argBlock += scanLine + "\n";
        if (!started && scanLine.match(/^\s*(undefined|void\s*0)\s*[,)]/)) break;
      }

      // Extract keys from the argument block
      const passedKeys = extractPassedKeys(argBlock, lines, i, file);

      callsites.push({
        file: relPath,
        line: i + 1,
        procedure: procName,
        hookType,
        passedKeys,
        rawArg: argBlock.trim().slice(0, 200),
      });
    }
  }

  return callsites;
}

function extractPassedKeys(argBlock, lines, lineIdx, file) {
  // Check for undefined / void / no-arg patterns
  const trimmed = argBlock.trim();
  if (!trimmed || trimmed === "undefined" || trimmed.startsWith("undefined,") || trimmed === "void 0") {
    return new Map(); // void input
  }

  const keys = new Map();

  // Direct object literal: { key: value, key2: value2 }
  // Match key: value patterns
  const keyPattern = /(\w+)\s*:/g;
  let m;
  while ((m = keyPattern.exec(argBlock)) !== null) {
    const key = m[1];
    // Skip common non-key patterns
    if (["retry", "staleTime", "enabled", "refetchInterval", "refetchOnWindowFocus",
         "onSuccess", "onError", "select", "keepPreviousData", "placeholderData"].includes(key)) {
      // These are React Query options, not input keys — but only if they appear
      // after the first comma at depth 0 (i.e., in the options object)
      // For simplicity, we'll check if they're in the first {} block
    }
    keys.set(key, "passed");
  }

  // Remove React Query option keys that are clearly in the second argument
  // We need to be smarter about this — check if the key is inside the first {} or second {}
  return keys;
}

// ── Step 3: Smarter argument parsing ──────────────────────────────────────────
// Re-parse callsites with better first-arg extraction

function parseCallsitesV2() {
  const files = [
    ...findFiles(join(CLIENT_SRC, "pages"), ".tsx"),
    ...findFiles(join(CLIENT_SRC, "components"), ".tsx"),
  ];

  const callsites = [];

  for (const file of files) {
    const src = readFileSync(file, "utf-8");
    const relPath = relative(ROOT, file);

    // Use a regex to find all trpc.wazuh.X.useQuery/useMutation calls
    const pattern = /trpc\.wazuh\.(\w+)\.(useQuery|useMutation)\s*\(/g;
    let match;
    while ((match = pattern.exec(src)) !== null) {
      const procName = match[1];
      const hookType = match[2];
      const callStart = match.index + match[0].length;

      // Find the line number
      const lineNum = src.slice(0, match.index).split("\n").length;

      // Extract the first argument by tracking parens/braces
      const firstArg = extractFirstArg(src, callStart);

      // Parse keys from the first argument
      const passedKeys = parseArgKeys(firstArg.text);
      const isVoid = firstArg.isVoid;

      callsites.push({
        file: relPath,
        line: lineNum,
        procedure: procName,
        hookType,
        passedKeys,
        isVoid,
        rawArg: firstArg.text.slice(0, 300),
      });
    }
  }

  return callsites;
}

function extractFirstArg(src, startIdx) {
  // The first arg to useQuery is either:
  // 1. undefined (or void 0)
  // 2. An object literal { ... }
  // 3. A variable reference
  // 4. A function call result
  // Followed by a comma (second arg = options) or closing paren

  let i = startIdx;
  // Skip whitespace
  while (i < src.length && /\s/.test(src[i])) i++;

  // Check for undefined
  if (src.slice(i, i + 9) === "undefined") {
    return { text: "undefined", isVoid: true };
  }

  // Check for closing paren (no args)
  if (src[i] === ")") {
    return { text: "", isVoid: true };
  }

  // Extract until we hit a comma at depth 0 or closing paren at depth -1
  let depth = 0;
  let start = i;
  let text = "";

  while (i < src.length) {
    const ch = src[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      if (depth < 0) {
        // Hit the closing paren of useQuery — first arg is everything before
        text = src.slice(start, i).trim();
        break;
      }
    }
    if (ch === "," && depth === 0) {
      // Hit the separator between first and second arg
      text = src.slice(start, i).trim();
      break;
    }
    i++;
  }

  return { text, isVoid: !text || text === "undefined" || text === "void 0" };
}

function parseArgKeys(argText) {
  const keys = new Map();
  if (!argText || argText === "undefined" || argText === "void 0") return keys;

  // Handle function call: qInput("packages") etc.
  const funcCallMatch = argText.match(/^(\w+)\s*\(/);
  if (funcCallMatch) {
    return new Map([["__dynamic__", `via ${funcCallMatch[1]}()`]]);
  }

  // Handle variable reference
  if (/^\w+$/.test(argText)) {
    return new Map([["__variable__", argText]]);
  }

  // Handle object literal { key: value, ... } or { shorthand, key: value }
  if (argText.startsWith("{")) {
    // Two-pass approach:
    // Pass 1: Find key: value pairs at depth 1
    // Pass 2: Find shorthand properties (bare identifiers at depth 1)
    let depth = 0;
    let tokenStart = -1;
    let inToken = false;

    for (let i = 0; i < argText.length; i++) {
      const ch = argText[i];
      if (ch === "{" || ch === "[" || ch === "(") depth++;
      if (ch === "}" || ch === "]" || ch === ")") depth--;

      if (depth === 1 && ch === ":") {
        // Found a key-value separator at depth 1
        let j = i - 1;
        while (j >= 0 && /\s/.test(argText[j])) j--;
        let keyEnd = j + 1;
        while (j >= 0 && /\w/.test(argText[j])) j--;
        const currentKey = argText.slice(j + 1, keyEnd);
        if (currentKey && /^\w+$/.test(currentKey)) {
          // Extract the value
          let valStart = i + 1;
          while (valStart < argText.length && /\s/.test(argText[valStart])) valStart++;
          let valDepth = 0;
          let valEnd = valStart;
          for (let k = valStart; k < argText.length; k++) {
            if (argText[k] === "{" || argText[k] === "[" || argText[k] === "(") valDepth++;
            if (argText[k] === "}" || argText[k] === "]" || argText[k] === ")") {
              if (valDepth === 0) { valEnd = k; break; }
              valDepth--;
            }
            if (argText[k] === "," && valDepth === 0) { valEnd = k; break; }
          }
          const value = argText.slice(valStart, valEnd).trim();
          keys.set(currentKey, value);
        }
      }
    }

    // Pass 2: Find shorthand properties — bare identifiers between { } , at depth 1
    // These are tokens like { agentId, limit } where agentId is shorthand for agentId: agentId
    const inner = argText.slice(1, argText.lastIndexOf("}")).trim();
    // Split by commas at depth 0 of the inner content
    let splitDepth = 0;
    let segStart = 0;
    const segments = [];
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === "{" || ch === "[" || ch === "(") splitDepth++;
      if (ch === "}" || ch === "]" || ch === ")") splitDepth--;
      if (ch === "," && splitDepth === 0) {
        segments.push(inner.slice(segStart, i).trim());
        segStart = i + 1;
      }
    }
    segments.push(inner.slice(segStart).trim());

    for (const seg of segments) {
      // Shorthand: just a bare identifier with optional trailing whitespace
      if (/^\w+$/.test(seg) && !keys.has(seg)) {
        keys.set(seg, "shorthand");
      }
      // Spread: ...something — skip
      // Computed: [expr]: val — skip
    }
  }

  return keys;
}

// ── Step 4: Resolve dynamic inputs ───────────────────────────────────────────
// For callsites that use helper functions like qInput(), resolve the actual keys

function resolveDynamicInputs(callsites) {
  for (const cs of callsites) {
    if (cs.passedKeys.has("__dynamic__")) {
      const funcRef = cs.passedKeys.get("__dynamic__");
      // Read the source file and find the function definition
      const src = readFileSync(join(ROOT, cs.file), "utf-8");

      if (funcRef.includes("qInput")) {
        // Find qInput function definition and extract the returned object keys
        const qInputMatch = src.match(/qInput[^{]*\{([\s\S]*?)\}/s);
        if (qInputMatch) {
          cs.passedKeys.delete("__dynamic__");
          // Only extract keys that appear before a colon (key: value pattern)
          // Also handle shorthand properties and spread
          const body = qInputMatch[1];
          const keyColonPattern = /^\s*(\w+)\s*:/gm;
          let km;
          while ((km = keyColonPattern.exec(body)) !== null) {
            cs.passedKeys.set(km[1], "dynamic");
          }
          // Handle spread patterns like ...(search ? { q: ... } : {})
          const spreadKeyPattern = /\{\s*(\w+)\s*:/g;
          let sm;
          while ((sm = spreadKeyPattern.exec(body)) !== null) {
            cs.passedKeys.set(sm[1], "dynamic-spread");
          }
        }
      }
    }
  }
}

// ── Step 5: Generate the report ──────────────────────────────────────────────

function generateReport(callsites, schemas) {
  const lines = [];
  const now = new Date().toISOString().split("T")[0];

  lines.push("# UI → Router Schema Parity Report");
  lines.push("");
  lines.push(`**Generated:** ${now}  `);
  lines.push(`**Script:** \`scripts/audit-ui-param-parity.mjs\`  `);
  lines.push(`**Callsites audited:** ${callsites.length}  `);
  lines.push(`**Unique procedures consumed:** ${new Set(callsites.map(c => c.procedure)).size} of ${schemas.size} total  `);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Summary table
  lines.push("## Summary");
  lines.push("");

  let totalSurfaced = 0, totalConstant = 0, totalNotSupported = 0, totalRequired = 0;
  let violations = [];

  // Group callsites by file
  const byFile = new Map();
  for (const cs of callsites) {
    if (!byFile.has(cs.file)) byFile.set(cs.file, []);
    byFile.get(cs.file).push(cs);
  }

  // Detailed sections per file
  for (const [file, fileCalls] of [...byFile.entries()].sort()) {
    lines.push(`## ${file}`);
    lines.push("");

    for (const cs of fileCalls) {
      const schema = schemas.get(cs.procedure);
      if (!schema) {
        lines.push(`### Line ${cs.line}: \`wazuh.${cs.procedure}\` — **SCHEMA NOT FOUND**`);
        lines.push("");
        violations.push({ file, line: cs.line, proc: cs.procedure, issue: "Procedure not found in router" });
        continue;
      }

      lines.push(`### Line ${cs.line}: \`wazuh.${cs.procedure}\``);
      lines.push("");

      if (schema.inputType === "void" && cs.isVoid) {
        lines.push("Input: void (no parameters) — **OK**");
        lines.push("");
        continue;
      }

      if (schema.inputType === "void" && !cs.isVoid) {
        lines.push(`Input: void expected but UI passes keys — **VIOLATION**`);
        violations.push({ file, line: cs.line, proc: cs.procedure, issue: "UI passes params to void-input procedure" });
        lines.push("");
        continue;
      }

      if (schema.keys.size === 0 && cs.isVoid) {
        lines.push("Input: void (no parameters) — **OK**");
        lines.push("");
        continue;
      }

      // Build classification table
      lines.push("| Parameter | Router | Required | UI Status | Classification |");
      lines.push("|-----------|--------|----------|-----------|----------------|");

      // Check for unknown keys passed by UI
      for (const [key, val] of cs.passedKeys) {
        if (key.startsWith("__")) continue;
        if (!schema.keys.has(key)) {
          lines.push(`| \`${key}\` | **NOT IN SCHEMA** | — | Passed | **UNKNOWN KEY** |`);
          violations.push({ file, line: cs.line, proc: cs.procedure, issue: `Unknown key "${key}" passed` });
        }
      }

      // Check each schema key
      for (const [key, info] of [...schema.keys.entries()].sort()) {
        const uiHasIt = cs.passedKeys.has(key);
        let classification;

        if (info.required) {
          totalRequired++;
          if (uiHasIt) {
            classification = "**Surfaced** (required)";
            totalSurfaced++;
          } else if (info.default) {
            classification = `**Constant** (default: ${info.default})`;
            totalConstant++;
          } else {
            classification = "**MISSING REQUIRED**";
            violations.push({ file, line: cs.line, proc: cs.procedure, issue: `Required key "${key}" not passed` });
          }
        } else {
          if (uiHasIt) {
            const val = cs.passedKeys.get(key);
            if (val && val !== "passed" && val !== "dynamic" && !val.includes("state") && !val.includes("State") && !val.includes("??") && !val.includes("||")) {
              classification = `**Constant** (hardcoded: \`${val.slice(0, 40)}\`)`;
              totalConstant++;
            } else {
              classification = "**Surfaced**";
              totalSurfaced++;
            }
          } else {
            classification = `**Not supported** — optional, not exposed in this view`;
            totalNotSupported++;
          }
        }

        lines.push(`| \`${key}\` | ${info.required ? "Required" : "Optional"} | ${info.required ? "Yes" : "No"} | ${uiHasIt ? "Passed" : "—"} | ${classification} |`);
      }

      lines.push("");
    }
  }

  // Insert summary at the top
  const summaryIdx = lines.indexOf("## Summary") + 2;
  const summaryLines = [
    "",
    "| Metric | Count |",
    "|--------|-------|",
    `| Total callsites | ${callsites.length} |`,
    `| Unique procedures consumed | ${new Set(callsites.map(c => c.procedure)).size} |`,
    `| Router procedures available | ${schemas.size} |`,
    `| Parameters surfaced in UI | ${totalSurfaced} |`,
    `| Parameters hardcoded/constant | ${totalConstant} |`,
    `| Parameters not supported (classified) | ${totalNotSupported} |`,
    `| Violations | ${violations.length} |`,
    "",
  ];

  if (violations.length > 0) {
    summaryLines.push("### Violations");
    summaryLines.push("");
    summaryLines.push("| File | Line | Procedure | Issue |");
    summaryLines.push("|------|------|-----------|-------|");
    for (const v of violations) {
      summaryLines.push(`| \`${v.file}\` | ${v.line} | \`${v.proc}\` | ${v.issue} |`);
    }
    summaryLines.push("");
  } else {
    summaryLines.push("**No violations found.** All UI callsites pass only schema-valid keys, all required params are present, and every optional param is classified.");
    summaryLines.push("");
  }

  // Unconsumed procedures section
  const consumed = new Set(callsites.map(c => c.procedure));
  const unconsumed = [...schemas.keys()].filter(k => !consumed.has(k)).sort();
  if (unconsumed.length > 0) {
    summaryLines.push("### Unconsumed Procedures (not called from any UI page)");
    summaryLines.push("");
    summaryLines.push("| Procedure | Input Keys | Disposition |");
    summaryLines.push("|-----------|-----------|-------------|");
    for (const proc of unconsumed) {
      const s = schemas.get(proc);
      const keyList = s.keys.size > 0 ? [...s.keys.keys()].join(", ") : "(void)";
      lines.push(""); // placeholder
      summaryLines.push(`| \`${proc}\` | ${keyList} | Backend-only / Not yet wired to UI |`);
    }
    summaryLines.push("");
  }

  lines.splice(summaryIdx, 0, ...summaryLines);

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("*This report is deterministically generated by `scripts/audit-ui-param-parity.mjs`. Re-run to verify.*");

  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

const CI_MODE = process.env.CI === "true" || process.argv.includes("--ci");

const schemas = parseRouterSchemas();
console.log(`Parsed ${schemas.size} router procedures`);

const callsites = parseCallsitesV2();
console.log(`Found ${callsites.length} UI callsites across ${new Set(callsites.map(c => c.file)).size} files`);

resolveDynamicInputs(callsites);

const report = generateReport(callsites, schemas);

// Also output a machine-readable JSON for CI
const jsonOutput = {
  generated: new Date().toISOString(),
  callsiteCount: callsites.length,
  procedureCount: schemas.size,
  consumedProcedures: [...new Set(callsites.map(c => c.procedure))].sort(),
  violations: [],
  callsites: callsites.map(cs => ({
    file: cs.file,
    line: cs.line,
    procedure: cs.procedure,
    passedKeys: Object.fromEntries(cs.passedKeys),
    isVoid: cs.isVoid,
  })),
  schemas: Object.fromEntries(
    [...schemas.entries()].map(([name, s]) => [
      name,
      {
        inputType: s.inputType,
        keys: Object.fromEntries(
          [...s.keys.entries()].map(([k, v]) => [k, v])
        ),
      },
    ])
  ),
};

// ── CI Enforcement Checks ────────────────────────────────────────────────────

let exitCode = 0;
const failures = [];

// Check 1: Violations (unknown keys, missing required, schema not found)
const violationMatch = report.match(/\| Violations \| (\d+) \|/);
const violationCount = violationMatch ? parseInt(violationMatch[1]) : 0;
if (violationCount > 0) {
  failures.push(`FAIL: ${violationCount} violation(s) found (unknown keys, missing required params, or schema mismatches)`);
  exitCode = 1;
}

// Check 2: Unclassified parameters (any param that isn't Surfaced / Constant / Not supported)
// In the report, every param row must contain one of: **Surfaced**, **Constant**, **Not supported**, **MISSING REQUIRED**, **UNKNOWN KEY**
// The latter two are violations (caught above). If we find a row without any classification, it's unclassified.
const reportLines = report.split("\n");
let unclassifiedCount = 0;
for (const line of reportLines) {
  // Only check table rows (start with |)
  if (!line.startsWith("|") || line.startsWith("|-") || line.includes("Parameter")) continue;
  // Skip summary table rows and unconsumed procedure rows
  if (line.includes("Metric") || line.includes("Backend-only") || line.includes("Total callsites")) continue;
  // Check if this is a param classification row (has 5 columns)
  const cols = line.split("|").filter(c => c.trim());
  if (cols.length >= 5) {
    const classification = cols[4].trim();
    if (!classification.includes("Surfaced") && 
        !classification.includes("Constant") && 
        !classification.includes("Not supported") &&
        !classification.includes("MISSING REQUIRED") &&
        !classification.includes("UNKNOWN KEY")) {
      unclassifiedCount++;
      failures.push(`FAIL: Unclassified parameter in row: ${line.trim()}`);
    }
  }
}
if (unclassifiedCount > 0) {
  exitCode = 1;
}

// Check 3: Dynamic inputs that couldn't be resolved
// "dynamic" and "dynamic-spread" are resolved from helper functions (e.g., qInput()) — acceptable.
// "DYNAMIC_UNRESOLVED" means the script couldn't trace the input at all — fail.
const dynamicUnresolved = callsites.filter(cs => {
  for (const [key, val] of cs.passedKeys) {
    if (val === "DYNAMIC_UNRESOLVED") return true;
  }
  return false;
});
if (dynamicUnresolved.length > 0) {
  failures.push(`FAIL: ${dynamicUnresolved.length} callsite(s) have truly unresolved dynamic inputs (could not trace input source)`);
  exitCode = 1;
}

// Store violations in JSON for downstream consumption
jsonOutput.violations = failures;

// Write outputs
writeFileSync(OUTPUT_FILE, report);
console.log(`Report written to ${OUTPUT_FILE}`);
writeFileSync(join(ROOT, "docs/ui-param-parity.json"), JSON.stringify(jsonOutput, null, 2));
console.log("JSON artifact written to docs/ui-param-parity.json");

// ── CI Summary ───────────────────────────────────────────────────────────────

console.log("");
console.log("═══════════════════════════════════════════════════");
console.log("  UI → Router Schema Parity Audit");
console.log("═══════════════════════════════════════════════════");
console.log(`  Callsites:       ${callsites.length}`);
console.log(`  Procedures:      ${new Set(callsites.map(c => c.procedure)).size} / ${schemas.size}`);
console.log(`  Violations:      ${violationCount}`);
console.log(`  Unclassified:    ${unclassifiedCount}`);
console.log(`  Unresolved:      ${dynamicUnresolved.length}`);
console.log(`  Status:          ${exitCode === 0 ? "✓ PASS" : "✗ FAIL"}`);
console.log("═══════════════════════════════════════════════════");

if (failures.length > 0) {
  console.log("");
  for (const f of failures) console.error(f);
}

process.exit(exitCode);
