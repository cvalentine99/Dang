/**
 * Source-check files were moved here from their original directories. Many of
 * them resolve the source they inspect relative to their old location
 * (`__dirname`), so each one now calls `origDir("<old dir>")` instead.
 */
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

export function origDir(relFromRepoRoot: string): string {
  return path.resolve(REPO_ROOT, relFromRepoRoot);
}
