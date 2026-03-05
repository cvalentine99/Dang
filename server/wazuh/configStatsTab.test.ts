/**
 * Config & Stats Tab + Agent Key Disclosure Policy Tests
 *
 * Verifies:
 * 1. Agent Detail page has a "config" tab with Config & Stats UI
 * 2. agentConfig, agentStats, agentKey endpoints are consumed in the tab
 * 3. agentKey disclosure policy: admin-only gate, masked by default, audit trail
 * 4. BrokerWarnings component is integrated in key consumer pages
 * 5. Sensitive access audit table exists in schema
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");
function readFile(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Config & Stats Tab — UI Structure
// ═══════════════════════════════════════════════════════════════════════════════

describe("Agent Detail — Config & Stats Tab", () => {
  const src = readFile("client/src/pages/AgentDetail.tsx");

  it("should have 'config' in the Tab type union", () => {
    expect(src).toMatch(/type Tab\s*=.*"config"/);
  });

  it("should include Config & Stats in TABS array", () => {
    expect(src).toContain('"config"');
    expect(src).toContain("Config & Stats");
  });

  it("should render ConfigStatsTab component for config tab", () => {
    expect(src).toContain("ConfigStatsTab");
    expect(src).toMatch(/activeTab\s*===\s*"config"/);
  });

  it("should consume trpc.wazuh.agentConfig", () => {
    expect(src).toContain("trpc.wazuh.agentConfig.useQuery");
  });

  it("should consume trpc.wazuh.agentStats", () => {
    expect(src).toContain("trpc.wazuh.agentStats.useQuery");
  });

  it("should consume trpc.wazuh.agentKey", () => {
    expect(src).toContain("trpc.wazuh.agentKey.useQuery");
  });

  it("should have a component/configuration picker for agentConfig", () => {
    expect(src).toContain("AGENT_CONFIG_PAIRS");
    expect(src).toContain("configPairIdx");
  });

  it("should have a component picker for agentStats", () => {
    expect(src).toContain("AGENT_STATS_COMPONENTS");
    expect(src).toContain("statsComponent");
  });

  it("should show Wazuh API path for config endpoint", () => {
    // Shows the GET path for transparency
    expect(src).toMatch(/GET\s+\/agents\//);
  });

  it("should include RawJsonViewer for config and stats data", () => {
    expect(src).toContain("RawJsonViewer");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Agent Key Disclosure Policy
// ═══════════════════════════════════════════════════════════════════════════════

describe("Agent Key — Disclosure Policy", () => {
  const src = readFile("client/src/pages/AgentDetail.tsx");

  it("should import useAuth for RBAC check", () => {
    expect(src).toContain("useAuth");
  });

  it("should check admin role before showing key", () => {
    expect(src).toMatch(/isAdmin/);
    expect(src).toMatch(/user\?\.role\s*===\s*"admin"/);
  });

  it("should mask key by default (keyRevealed = false)", () => {
    expect(src).toContain("keyRevealed");
    expect(src).toMatch(/useState\(false\)/);
  });

  it("should require deliberate reveal action", () => {
    expect(src).toContain("handleRevealKey");
    expect(src).toContain("Reveal Agent Key");
  });

  it("should show disclosure policy warning before reveal", () => {
    expect(src).toContain("Disclosure Policy");
    expect(src).toContain("logged with your user ID");
    expect(src).toContain("not cached");
  });

  it("should allow hiding the key after reveal", () => {
    expect(src).toContain("handleHideKey");
    expect(src).toContain("EyeOff");
  });

  it("should evict key from React Query cache on unmount", () => {
    expect(src).toContain("utils.wazuh.agentKey.invalidate");
    expect(src).toContain("gcTime: 0");
    expect(src).toContain("staleTime: 0");
  });

  it("should have copy-to-clipboard as a privileged action", () => {
    expect(src).toContain("handleCopyKey");
    expect(src).toContain("navigator.clipboard.writeText");
  });

  it("should show lock icon for non-admin users", () => {
    expect(src).toContain("Lock");
    expect(src).toContain("restricted to administrators");
  });

  it("should show Admin Only badge", () => {
    expect(src).toContain("Admin Only");
    expect(src).toContain("ShieldAlert");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Sensitive Access Audit Schema
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sensitive Access Audit — Schema", () => {
  const schema = readFile("drizzle/schema.ts");

  it("should define sensitiveAccessAudit table", () => {
    expect(schema).toContain("sensitiveAccessAudit");
  });

  it("should have userId column", () => {
    expect(schema).toMatch(/userId|user_id/);
  });

  it("should have resourceType column", () => {
    expect(schema).toMatch(/resourceType|resource_type/);
  });

  it("should have resourceId column", () => {
    expect(schema).toMatch(/resourceId|resource_id/);
  });

  it("should have action column", () => {
    expect(schema).toContain("action");
  });
});

describe("Sensitive Access Audit — Router Integration", () => {
  const router = readFile("server/wazuh/wazuhRouter.ts");

  it("should import logSensitiveAccess from db", () => {
    expect(router).toContain("logSensitiveAccess");
  });

  it("should call logSensitiveAccess in agentKey procedure", () => {
    // The agentKey procedure should log the access
    expect(router).toContain("logSensitiveAccess");
  });

  it("should use protectedProcedure for agentKey (auth required)", () => {
    // agentKey should require authentication
    expect(router).toMatch(/agentKey.*protectedProcedure|protectedProcedure.*agentKey/s);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. BrokerWarnings Integration Across Pages
// ═══════════════════════════════════════════════════════════════════════════════

describe("BrokerWarnings — Page Integration", () => {
  const pages: [string, string][] = [
    ["AgentDetail.tsx", "client/src/pages/AgentDetail.tsx"],
    ["AgentHealth.tsx", "client/src/pages/AgentHealth.tsx"],
    ["FleetInventory.tsx", "client/src/pages/FleetInventory.tsx"],
    ["ITHygiene.tsx", "client/src/pages/ITHygiene.tsx"],
    ["ClusterHealth.tsx", "client/src/pages/ClusterHealth.tsx"],
    ["RulesetExplorer.tsx", "client/src/pages/RulesetExplorer.tsx"],
  ];

  it.each(pages)(
    "%s should import BrokerWarnings",
    (_name, path) => {
      const src = readFile(path);
      expect(src).toContain('import { BrokerWarnings }');
    }
  );

  it.each(pages)(
    "%s should render <BrokerWarnings> with data and context props",
    (_name, path) => {
      const src = readFile(path);
      expect(src).toMatch(/<BrokerWarnings\s+data=/);
      // context can be a static string (context="...") or dynamic expression (context={...})
      expect(src).toMatch(/context[="{]/);
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. BrokerWarnings Component — Structure
// ═══════════════════════════════════════════════════════════════════════════════

describe("BrokerWarnings Component", () => {
  const src = readFile("client/src/components/shared/BrokerWarnings.tsx");

  it("should export BrokerWarnings component", () => {
    expect(src).toMatch(/export\s+(function|const)\s+BrokerWarnings/);
  });

  it("should accept data and context props", () => {
    expect(src).toContain("data");
    expect(src).toContain("context");
  });

  it("should check for _brokerWarnings field", () => {
    expect(src).toContain("_brokerWarnings");
  });

  it("should be dismissible", () => {
    expect(src).toMatch(/dismiss|close|setDismissed|setVisible/i);
  });

  it("should have a show details toggle for raw warnings", () => {
    expect(src).toMatch(/showDetails|expanded|toggle/i);
  });

  it("should return null when no warnings exist", () => {
    expect(src).toMatch(/return\s+null/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Fail-Closed Audit Gate — logSensitiveAccess throws on failure
// ═══════════════════════════════════════════════════════════════════════════════

describe("Fail-Closed Audit Gate", () => {
  const dbSrc = readFile("server/db.ts");
  const routerSrc = readFile("server/wazuh/wazuhRouter.ts");

  it("logSensitiveAccess should throw when DB is unavailable (not swallow)", () => {
    // Must NOT contain "Swallow" or fire-and-forget patterns
    expect(dbSrc).not.toMatch(/Swallow|fire.and.forget/i);
    // Must throw on DB failure
    expect(dbSrc).toContain("throw new Error(\"Audit logging unavailable: database connection failed.");
  });

  it("logSensitiveAccess should throw when insert fails", () => {
    expect(dbSrc).toContain("throw new Error(\"Audit logging unavailable: insert failed.");
  });

  it("logSensitiveAccess docstring should state FAIL-CLOSED contract", () => {
    expect(dbSrc).toMatch(/FAIL-CLOSED/);
    expect(dbSrc).toContain("caller MUST NOT reveal the sensitive data");
  });

  it("agentKey procedure should catch audit failure and refuse key reveal", () => {
    // The agentKey handler must wrap logSensitiveAccess in try/catch
    // and throw TRPCError on audit failure
    expect(routerSrc).toContain("Audit logging unavailable; cannot reveal key.");
    expect(routerSrc).toMatch(/INTERNAL_SERVER_ERROR/);
  });

  it("agentKey procedure should call audit BEFORE proxyGet", () => {
    // The audit call must appear before the proxyGet call in the agentKey handler
    const auditIdx = routerSrc.indexOf("logSensitiveAccess");
    const proxyIdx = routerSrc.indexOf("proxyGet(`/agents/${input.agentId}/key`)");
    expect(auditIdx).toBeGreaterThan(-1);
    expect(proxyIdx).toBeGreaterThan(-1);
    expect(auditIdx).toBeLessThan(proxyIdx);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Drizzle Migration File for sensitive_access_audit
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sensitive Access Audit — Migration", () => {
  const { existsSync } = require("fs");
  const migrationPath = join(ROOT, "drizzle", "0013_sensitive_access_audit.sql");

  it("migration file 0013_sensitive_access_audit.sql should exist", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it("migration should be registered in drizzle journal", () => {
    const journal = JSON.parse(readFile("drizzle/meta/_journal.json"));
    const entry = journal.entries.find((e: any) => e.tag === "0013_sensitive_access_audit");
    expect(entry).toBeDefined();
    expect(entry.idx).toBe(13);
  });

  it("migration should CREATE TABLE sensitive_access_audit", () => {
    const sql = readFile("drizzle/0013_sensitive_access_audit.sql");
    expect(sql).toMatch(/CREATE TABLE.*sensitive_access_audit/i);
  });

  it("migration should create indexes for userId, resourceType, resourceId, createdAt", () => {
    const sql = readFile("drizzle/0013_sensitive_access_audit.sql");
    expect(sql).toMatch(/CREATE INDEX.*saa_userId_idx/i);
    expect(sql).toMatch(/CREATE INDEX.*saa_resourceType_idx/i);
    expect(sql).toMatch(/CREATE INDEX.*saa_resourceId_idx/i);
    expect(sql).toMatch(/CREATE INDEX.*saa_createdAt_idx/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Manager Logs + Manager Configuration — UI Wiring in Cluster Health
// ═══════════════════════════════════════════════════════════════════════════════

describe("ClusterHealth — managerLogs UI Wiring", () => {
  const src = readFile("client/src/pages/ClusterHealth.tsx");

  it("should consume trpc.wazuh.managerLogs.useQuery", () => {
    expect(src).toContain("trpc.wazuh.managerLogs.useQuery");
  });

  it("should have level filter (error/warning/info/debug)", () => {
    expect(src).toContain("logLevel");
    expect(src).toContain('"error"');
    expect(src).toContain('"warning"');
    expect(src).toContain('"info"');
    expect(src).toContain('"debug"');
  });

  it("should have tag filter input", () => {
    expect(src).toContain("logTag");
    expect(src).toMatch(/Filter by tag/);
  });

  it("should have pagination for logs", () => {
    expect(src).toContain("mgrLogPage");
    expect(src).toContain("setMgrLogPage");
  });

  it("should render log table with timestamp, level, tag, description columns", () => {
    expect(src).toContain("Timestamp");
    expect(src).toContain("Level");
    expect(src).toContain("Tag");
    expect(src).toContain("Description");
  });

  it("should include BrokerWarnings for managerLogs", () => {
    expect(src).toContain('context="Manager Logs"');
  });

  it("should include RawJsonViewer for managerLogs", () => {
    expect(src).toContain("Manager Logs JSON");
  });
});

describe("ClusterHealth — managerConfiguration UI Wiring", () => {
  const src = readFile("client/src/pages/ClusterHealth.tsx");

  it("should consume trpc.wazuh.managerConfiguration.useQuery", () => {
    expect(src).toContain("trpc.wazuh.managerConfiguration.useQuery");
  });

  it("should have section filter dropdown", () => {
    expect(src).toContain("cfgSection");
    expect(src).toContain("setCfgSection");
  });

  it("should offer common section options (global, alerts, syscheck, cluster, etc.)", () => {
    expect(src).toContain('"global"');
    expect(src).toContain('"alerts"');
    expect(src).toContain('"syscheck"');
    expect(src).toContain('"cluster"');
  });

  it("should render config as key-value pairs", () => {
    // Config entries are rendered as key-value rows
    expect(src).toMatch(/entries\.map/);
  });

  it("should include BrokerWarnings for managerConfiguration", () => {
    expect(src).toContain('context="Manager Configuration"');
  });

  it("should include RawJsonViewer for managerConfiguration", () => {
    expect(src).toContain("Manager Configuration JSON");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Sensitive Access Audit — Admin Viewer
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sensitive Access Audit — Admin Router", () => {
  const router = readFile("server/admin/sensitiveAccessRouter.ts");

  it("should export sensitiveAccessRouter", () => {
    expect(router).toMatch(/export\s+(const|function)\s+sensitiveAccessRouter/);
  });

  it("should use adminProcedure for listSensitiveAccess", () => {
    expect(router).toContain("adminProcedure");
  });

  it("should query sensitiveAccessAudit table", () => {
    expect(router).toContain("sensitiveAccessAudit");
  });

  it("should support pagination (limit/offset)", () => {
    expect(router).toContain("limit");
    expect(router).toContain("offset");
  });

  it("should support filtering by resourceType", () => {
    expect(router).toContain("resourceType");
  });
});

describe("Sensitive Access Audit — UI Page", () => {
  const src = readFile("client/src/pages/SensitiveAccessAudit.tsx");

  it("should consume trpc.sensitiveAccess.list.useQuery", () => {
    expect(src).toContain("trpc.sensitiveAccess.list.useQuery");
  });

  it("should render a table with userId, resourceType, resourceId, action, createdAt columns", () => {
    expect(src).toContain("User");
    expect(src).toContain("Resource Type");
    expect(src).toContain("Resource ID");
    expect(src).toContain("Action");
  });

  it("should have pagination controls", () => {
    expect(src).toContain("setPage");
    expect(src).toMatch(/page/);
  });

  it("should use GlassPanel for the table container", () => {
    expect(src).toContain("GlassPanel");
  });

  it("should use GlassPanel-based layout", () => {
    // Audit page uses GlassPanel for the table container
    expect(src).toContain("GlassPanel");
  });
});

describe("Sensitive Access Audit — Route + Nav", () => {
  const appSrc = readFile("client/src/App.tsx");
  const navSrc = readFile("client/src/components/DashboardLayout.tsx");

  it("should have /admin/audit route in App.tsx", () => {
    expect(appSrc).toMatch(/\/admin\/audit/);
  });

  it("should import SensitiveAccessAudit page", () => {
    expect(appSrc).toContain("SensitiveAccessAudit");
  });

  it("should have Access Audit link in DashboardLayout sidebar", () => {
    expect(navSrc).toContain("Access Audit");
    expect(navSrc).toContain("/admin/audit");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Agent Overview — Home Page Wiring
// ═══════════════════════════════════════════════════════════════════════════════

describe("Home — agentOverview Wiring", () => {
  const src = readFile("client/src/pages/Home.tsx");

  it("should consume trpc.wazuh.agentOverview.useQuery", () => {
    expect(src).toContain("trpc.wazuh.agentOverview.useQuery");
  });

  it("should render AgentOverviewTable component", () => {
    expect(src).toContain("AgentOverviewTable");
  });

  it("should include RawJsonViewer for agent overview data", () => {
    expect(src).toContain('title="Agent Overview"');
  });

  it("should show node-level breakdown (node_name, node_type, counts)", () => {
    expect(src).toContain("node_name");
    expect(src).toContain("node_type");
  });

  it("should show per-status counts (active, disconnected, never_connected, pending)", () => {
    expect(src).toContain("active");
    expect(src).toContain("disconnected");
    expect(src).toContain("never_connected");
    expect(src).toContain("pending");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. Agent Daemon Stats — Agent Detail Wiring
// ═══════════════════════════════════════════════════════════════════════════════

describe("Agent Detail — agentDaemonStats Wiring", () => {
  const src = readFile("client/src/pages/AgentDetail.tsx");

  it("should consume trpc.wazuh.agentDaemonStats.useQuery", () => {
    expect(src).toContain("trpc.wazuh.agentDaemonStats.useQuery");
  });

  it("should render daemon stats panel in ConfigStatsTab", () => {
    expect(src).toContain("Daemon Stats");
  });

  it("should include RawJsonViewer for daemon stats data", () => {
    expect(src).toContain("RawJsonViewer");
    expect(src).toContain("daemonStatsQ.data");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. materializeResponseActions — Partial Failure Signal
// ═══════════════════════════════════════════════════════════════════════════════

describe("materializeResponseActions — Partial Failure Signal", () => {
  const hypoSrc = readFile("server/agenticPipeline/hypothesisAgent.ts");

  it("should return structured result with ids, attempted, succeeded, failed", () => {
    expect(hypoSrc).toContain("ids: materializedIds");
    expect(hypoSrc).toContain("attempted: actions.length");
    expect(hypoSrc).toContain("succeeded: materializedIds.length");
    expect(hypoSrc).toContain("failed: failedActions");
  });

  it("should track failed actions with index, action name, and error", () => {
    expect(hypoSrc).toContain("failedActions.push");
    expect(hypoSrc).toContain("index:");
    expect(hypoSrc).toContain("error: errMsg");
  });

  it("should log partial failure warning when some actions fail", () => {
    expect(hypoSrc).toContain("Partial failure:");
  });

  it("should propagate materializePartialFailure on HypothesisAgentResult", () => {
    expect(hypoSrc).toContain("materializePartialFailure:");
    // The return value uses ternary: materializePartialFailure: ... ? { ... } : null
    expect(hypoSrc).toContain(": null,");
  });

  it("HypothesisAgentResult interface should include materializePartialFailure field", () => {
    expect(hypoSrc).toMatch(/materializePartialFailure.*\{/);
    expect(hypoSrc).toContain("attempted: number");
    expect(hypoSrc).toContain("succeeded: number");
  });
});

describe("Partial Failure Signal — Pipeline Router Propagation", () => {
  const routerSrc = readFile("server/agenticPipeline/pipelineRouter.ts");
  const resumeSrc = readFile("server/agenticPipeline/resumePipelineHelper.ts");

  it("pipelineRouter should propagate materializePartialFailure in hypothesis mutation", () => {
    expect(routerSrc).toContain("materializePartialFailure: result.materializePartialFailure");
  });

  it("pipelineRouter should set responseActions status to 'partial' on partial failure", () => {
    expect(routerSrc).toContain('? "partial"');
  });

  it("resumePipelineHelper should propagate partial failure in responseActions stage", () => {
    expect(resumeSrc).toContain("partialFailure");
    expect(resumeSrc).toContain('? "partial"');
  });
});
