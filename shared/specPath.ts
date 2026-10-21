/**
 * Canonical Wazuh OpenAPI spec location — the ONE place the filename lives.
 *
 * Upgrading the spec: drop the new `spec-vX.Y.Z.yaml` at the project root,
 * change WAZUH_SPEC_FILENAME, and repoint the `spec/wazuh-api-vX.Y.Z.yaml` symlink.
 *
 * Resolution order: WAZUH_SPEC_PATH env → <cwd>/<filename> → <projectRoot>/<filename>.
 * cwd is checked first because the esbuild bundle runs from /app/dist in Docker,
 * where __dirname-relative resolution lands outside the project.
 */
import { existsSync } from "fs";
import { resolve } from "path";

export const WAZUH_SPEC_FILENAME = "spec-v4.14.4.yaml";

/** `spec/` alias name derived from the canonical filename (symlink target). */
export const WAZUH_SPEC_ALIAS = WAZUH_SPEC_FILENAME.replace(/^spec-/, "wazuh-api-");

export function resolveSpecPath(projectRoot?: string): string {
  if (process.env.WAZUH_SPEC_PATH) return resolve(process.env.WAZUH_SPEC_PATH);
  const fromCwd = resolve(process.cwd(), WAZUH_SPEC_FILENAME);
  if (existsSync(fromCwd)) return fromCwd;
  return resolve(projectRoot ?? process.cwd(), WAZUH_SPEC_FILENAME);
}
