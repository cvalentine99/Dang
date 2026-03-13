import { readFileSync, writeFileSync } from "fs";

const files = {
  "server/agenticPipeline/pipelineRouter.ts": "../dbGuard",
  "server/agenticPipeline/responseActionsRouter.ts": "../dbGuard",
  "server/alertQueue/alertQueueRouter.ts": "../dbGuard",
  "server/alertQueue/autoQueueRouter.ts": "../dbGuard",
  "server/baselines/anomalyRouter.ts": "../dbGuard",
  "server/baselines/baselineSchedulesRouter.ts": "../dbGuard",
  "server/baselines/baselinesRouter.ts": "../dbGuard",
  "server/baselines/driftAnalyticsRouter.ts": "../dbGuard",
  "server/baselines/exportRouter.ts": "../dbGuard",
  "server/baselines/notificationHistoryRouter.ts": "../dbGuard",
  "server/baselines/suppressionRouter.ts": "../dbGuard",
  "server/graph/graphRouter.ts": "../dbGuard",
  "server/hunt/huntRouter.ts": "../dbGuard",
  "server/hybridrag/hybridragRouter.ts": "../dbGuard",
  "server/llm/llmRouter.ts": "../dbGuard",
  "server/notes/notesRouter.ts": "../dbGuard",
  "server/savedSearches/savedSearchesRouter.ts": "../dbGuard",
};

for (const [file, importPath] of Object.entries(files)) {
  let content = readFileSync(file, "utf-8");
  if (content.includes("requireDb")) {
    // Check if import already exists
    if (content.includes(`from "${importPath}"`)) {
      console.log(`  ${file}: import already exists`);
      continue;
    }
  }
  // Uses requireDb but no import — add it after the first import block
  if (content.includes("requireDb") && !content.includes(`import { requireDb }`)) {
    const importLine = `import { requireDb } from "${importPath}";\n`;
    // Find the first import and add before it
    const firstImport = content.indexOf("import ");
    if (firstImport !== -1) {
      content = content.slice(0, firstImport) + importLine + content.slice(firstImport);
      writeFileSync(file, content);
      console.log(`✅ ${file}: added import`);
    }
  } else {
    console.log(`  ${file}: no requireDb usage or import already present`);
  }
}
