/**
 * Batch fix: Replace `const db = await getDb(); if (!db) return <fake>;`
 * with `const db = await requireDb();` in all router files.
 *
 * This script handles the two-line pattern:
 *   const db = await getDb();
 *   if (!db) return <anything>;
 *
 * And replaces it with:
 *   const db = await requireDb();
 *
 * It also ensures the import of requireDb is added if not already present.
 */
import { readFileSync, writeFileSync } from "fs";

const routerFiles = [
  "server/agenticPipeline/pipelineRouter.ts",
  "server/agenticPipeline/responseActionsRouter.ts",
  "server/alertQueue/alertQueueRouter.ts",
  "server/alertQueue/autoQueueRouter.ts",
  "server/baselines/anomalyRouter.ts",
  "server/baselines/baselineSchedulesRouter.ts",
  "server/baselines/baselinesRouter.ts",
  "server/baselines/driftAnalyticsRouter.ts",
  "server/baselines/exportRouter.ts",
  "server/baselines/notificationHistoryRouter.ts",
  "server/baselines/suppressionRouter.ts",
  "server/graph/graphRouter.ts",
  "server/hunt/huntRouter.ts",
  "server/hybridrag/hybridragRouter.ts",
  "server/llm/llmRouter.ts",
  "server/notes/notesRouter.ts",
  "server/savedSearches/savedSearchesRouter.ts",
];

let totalFixed = 0;

for (const file of routerFiles) {
  let content = readFileSync(file, "utf-8");
  const original = content;

  // Pattern: `const db = await getDb();\n      if (!db) return <anything>;`
  // The indentation and return value vary, so we use a flexible regex
  const pattern = /const db = await getDb\(\);\s*\n\s*if \(!db\) return[^;]*;/g;
  const matches = content.match(pattern);
  if (!matches) {
    console.log(`  ${file}: no matches`);
    continue;
  }

  content = content.replace(pattern, "const db = await requireDb();");

  // Add requireDb import if not already present
  if (!content.includes("requireDb")) {
    // Already has getDb import — add requireDb next to it or as separate import
    if (content.includes('from "../db"') || content.includes('from "../db.js"')) {
      // Add requireDb import after the getDb import
      content = content.replace(
        /import\s*{([^}]*getDb[^}]*)}\s*from\s*"\.\.\/db[^"]*"/,
        (match, imports) => {
          return match; // keep original, add new import after
        }
      );
    }
    // Add a standalone import for requireDb
    if (!content.includes("requireDb")) {
      // Find the right relative path based on file depth
      const depth = file.split("/").length - 2; // relative to server/
      const prefix = depth > 1 ? "../".repeat(depth - 1) : "./";
      const importLine = `import { requireDb } from "${prefix}dbGuard";\n`;

      // Insert after the last import statement
      const lastImportIdx = content.lastIndexOf("\nimport ");
      if (lastImportIdx !== -1) {
        const endOfLine = content.indexOf("\n", lastImportIdx + 1);
        content = content.slice(0, endOfLine + 1) + importLine + content.slice(endOfLine + 1);
      } else {
        content = importLine + content;
      }
    }
  }

  // Remove unused getDb import if no longer referenced
  // Only remove if getDb is no longer used anywhere else in the file
  const getDbUsages = (content.match(/getDb/g) || []).length;
  const getDbImportCount = (content.match(/import.*getDb/g) || []).length;
  if (getDbUsages === getDbImportCount) {
    // getDb is only in the import, remove it
    content = content.replace(/import\s*{\s*getDb\s*}\s*from\s*"[^"]*";\s*\n?/, "");
    // If getDb is part of a multi-import, just remove getDb from the list
    content = content.replace(/,\s*getDb\s*/, "");
    content = content.replace(/getDb\s*,\s*/, "");
  }

  if (content !== original) {
    writeFileSync(file, content);
    console.log(`✅ ${file}: fixed ${matches.length} instances`);
    totalFixed += matches.length;
  }
}

console.log(`\nTotal fixed: ${totalFixed} fake-empty returns across ${routerFiles.length} files`);
