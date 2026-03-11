/**
 * Export Utilities — CSV and JSON download helpers for SOC data tables.
 *
 * All exports are client-side only. Data is never sent to external services.
 * Filenames include timestamps and optional filter context for traceability.
 */

/** Flatten a nested object into dot-notation keys for CSV columns */
function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value === null || value === undefined) {
      result[fullKey] = "";
    } else if (Array.isArray(value)) {
      result[fullKey] = JSON.stringify(value);
    } else if (typeof value === "object" && !(value instanceof Date)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = String(value);
    }
  }
  return result;
}

/** Escape a CSV cell value (handles commas, quotes, newlines) */
function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Convert an array of objects to CSV string */
export function toCSV(
  data: Array<Record<string, unknown>>,
  columns?: { key: string; label: string }[]
): string {
  if (data.length === 0) return "";

  // Flatten all rows
  const flatRows = data.map((row) => flattenObject(row));

  // Determine columns
  let headers: { key: string; label: string }[];
  if (columns) {
    headers = columns;
  } else {
    // Auto-detect from all rows
    const allKeys = new Set<string>();
    flatRows.forEach((row) => Object.keys(row).forEach((k) => allKeys.add(k)));
    headers = Array.from(allKeys).map((k) => ({ key: k, label: k }));
  }

  // Build CSV
  const headerLine = headers.map((h) => escapeCSV(h.label)).join(",");
  const bodyLines = flatRows.map((row) =>
    headers.map((h) => escapeCSV(row[h.key] ?? "")).join(",")
  );

  return [headerLine, ...bodyLines].join("\n");
}

/** Convert data to formatted JSON string */
export function toJSON(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** Generate a timestamped filename */
export function makeFilename(
  base: string,
  format: "csv" | "json",
  context?: string
): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const ctx = context ? `_${context.replace(/[^a-zA-Z0-9-_]/g, "_")}` : "";
  return `dang_${base}${ctx}_${ts}.${format}`;
}

/** Trigger a browser download for a string blob */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Export data as CSV file download */
export function exportCSV(
  data: Array<Record<string, unknown>>,
  baseName: string,
  options?: {
    columns?: { key: string; label: string }[];
    context?: string;
  }
): void {
  const csv = toCSV(data, options?.columns);
  const filename = makeFilename(baseName, "csv", options?.context);
  downloadFile(csv, filename, "text/csv;charset=utf-8;");
}

/** Export data as JSON file download */
export function exportJSON(
  data: unknown,
  baseName: string,
  context?: string
): void {
  const json = toJSON(data);
  const filename = makeFilename(baseName, "json", context);
  downloadFile(json, filename, "application/json;charset=utf-8;");
}

/** Column definitions for common export types */
export const EXPORT_COLUMNS = {
  alerts: [
    { key: "timestamp", label: "Timestamp" },
    { key: "rule.id", label: "Rule ID" },
    { key: "rule.description", label: "Description" },
    { key: "rule.level", label: "Level" },
    { key: "rule.groups", label: "Groups" },
    { key: "rule.mitre.id", label: "MITRE ID" },
    { key: "rule.mitre.tactic", label: "MITRE Tactic" },
    { key: "agent.id", label: "Agent ID" },
    { key: "agent.name", label: "Agent Name" },
    { key: "agent.ip", label: "Agent IP" },
    { key: "data.srcip", label: "Source IP" },
    { key: "data.dstip", label: "Destination IP" },
    { key: "decoder.name", label: "Decoder" },
  ],
  vulnerabilities: [
    { key: "cve", label: "CVE ID" },
    { key: "name", label: "Package" },
    { key: "version", label: "Version" },
    { key: "severity", label: "Severity" },
    { key: "cvss2_score", label: "CVSS v2" },
    { key: "cvss3_score", label: "CVSS v3" },
    { key: "status", label: "Status" },
    { key: "detection_time", label: "Detection Time" },
    { key: "published", label: "Published" },
    { key: "title", label: "Title" },
    { key: "external_references", label: "References" },
  ],
  packages: [
    { key: "name", label: "Package" },
    { key: "version", label: "Version" },
    { key: "architecture", label: "Architecture" },
    { key: "vendor", label: "Vendor" },
    { key: "format", label: "Format" },
    { key: "description", label: "Description" },
  ],
  ports: [
    { key: "protocol", label: "Protocol" },
    { key: "local.ip", label: "Local IP" },
    { key: "local.port", label: "Local Port" },
    { key: "remote.ip", label: "Remote IP" },
    { key: "remote.port", label: "Remote Port" },
    { key: "pid", label: "PID" },
    { key: "process", label: "Process" },
    { key: "state", label: "State" },
  ],
  processes: [
    { key: "pid", label: "PID" },
    { key: "name", label: "Name" },
    { key: "state", label: "State" },
    { key: "euser", label: "User" },
    { key: "ppid", label: "PPID" },
    { key: "priority", label: "Priority" },
    { key: "nlwp", label: "Threads" },
    { key: "cmd", label: "Command" },
  ],
  services: [
    { key: "name", label: "Service" },
    { key: "display_name", label: "Display Name" },
    { key: "state", label: "State" },
    { key: "start_type", label: "Startup Type" },
    { key: "pid", label: "PID" },
    { key: "description", label: "Description" },
  ],
  users: [
    { key: "name", label: "Username" },
    { key: "uid", label: "UID" },
    { key: "gid", label: "GID" },
    { key: "home", label: "Home" },
    { key: "shell", label: "Shell" },
    { key: "login", label: "Last Login" },
  ],
  groups: [
    { key: "name", label: "Group" },
    { key: "gid", label: "GID" },
    { key: "members", label: "Members" },
  ],
  siemEvents: [
    { key: "timestamp", label: "Timestamp" },
    { key: "agent", label: "Agent" },
    { key: "agentId", label: "Agent ID" },
    { key: "ruleId", label: "Rule ID" },
    { key: "ruleDescription", label: "Description" },
    { key: "level", label: "Level" },
    { key: "decoder", label: "Decoder" },
    { key: "srcIp", label: "Source IP" },
    { key: "dstIp", label: "Destination IP" },
    { key: "mitreTactic", label: "MITRE Tactic" },
    { key: "mitreId", label: "MITRE ID" },
    { key: "logSource", label: "Log Source" },
  ],
  topRules: [
    { key: "id", label: "Rule ID" },
    { key: "description", label: "Description" },
    { key: "level", label: "Level" },
    { key: "count", label: "Alert Count" },
    { key: "groups", label: "Groups" },
  ],
  topTalkers: [
    { key: "agent_id", label: "Agent ID" },
    { key: "agent_name", label: "Agent Name" },
    { key: "count", label: "Alert Count" },
  ],
};
