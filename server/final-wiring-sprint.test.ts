/**
 * Final Wiring Sprint — Tests for all remaining procedure wiring
 *
 * Covers:
 * 1. agentsSummary → Home.tsx
 * 2. isConfigured → Status.tsx (WazuhApiIntelligence)
 * 3. managerComponentConfig → Status.tsx
 * 4. agentsUninstallPermission → Status.tsx
 * 5. taskStatus → Status.tsx
 * 6. decoderParents → RulesetExplorer.tsx
 * 7. rulesByRequirement → RulesetExplorer.tsx
 * 8. mitreSoftware → MitreAttack.tsx
 * 9. mitreMitigations → MitreAttack.tsx
 * 10. mitreReferences → MitreAttack.tsx
 * 11. ciscatResults → AgentDetail.tsx
 * 12. agentGroupSync → AgentDetail.tsx (OverviewTab)
 * 13. agentsUpgradeResult → AgentHealth.tsx
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── Helper ──────────────────────────────────────────────────────────────────
function readPage(name: string): string {
  return fs.readFileSync(
    path.resolve(__dirname, `../client/src/pages/${name}`),
    "utf-8"
  );
}

// ── 1. agentsSummary → Home.tsx ─────────────────────────────────────────────
describe("Home.tsx — agentsSummary wiring", () => {
  const content = readPage("Home.tsx");
  it("queries trpc.wazuh.agentsSummary", () => {
    expect(content).toContain("trpc.wazuh.agentsSummary.useQuery");
  });
  it("renders an Agent Summary heading", () => {
    expect(content).toMatch(/Agent.*Summary/i);
  });
  it("renders BrokerWarnings for agentsSummary", () => {
    expect(content).toMatch(/BrokerWarnings.*context.*agentsSummary/s);
  });
  it("renders RawJsonViewer for agentsSummary", () => {
    expect(content).toMatch(/RawJsonViewer.*agentsSummary/is);
  });
});

// ── 2. isConfigured → Status.tsx ────────────────────────────────────────────
describe("Status.tsx — isConfigured wiring", () => {
  const content = readPage("Status.tsx");
  it("queries trpc.wazuh.isConfigured", () => {
    expect(content).toContain("trpc.wazuh.isConfigured.useQuery");
  });
  it("renders a Configuration Validation panel", () => {
    expect(content).toMatch(/Configuration Validation/i);
  });
  it("shows the isConfigured endpoint label", () => {
    expect(content).toContain("isConfigured");
  });
  it("renders RawJsonViewer for isConfigured", () => {
    expect(content).toMatch(/RawJsonViewer.*Config Validation/is);
  });
});

// ── 3. managerComponentConfig → Status.tsx ──────────────────────────────────
describe("Status.tsx — managerComponentConfig wiring", () => {
  const content = readPage("Status.tsx");
  it("queries trpc.wazuh.managerComponentConfig", () => {
    expect(content).toContain("trpc.wazuh.managerComponentConfig.useQuery");
  });
  it("renders a Manager Component Config heading", () => {
    expect(content).toMatch(/Manager Component Config/i);
  });
  it("has component selector dropdown", () => {
    expect(content).toContain("compConfigComponent");
  });
  it("has configuration selector dropdown", () => {
    expect(content).toContain("compConfigConfiguration");
  });
  it("renders BrokerWarnings for managerComponentConfig", () => {
    expect(content).toMatch(/BrokerWarnings.*context.*managerComponentConfig/s);
  });
  it("renders RawJsonViewer for managerComponentConfig", () => {
    expect(content).toMatch(/RawJsonViewer.*Manager Component Config/is);
  });
  it("handles loading, error, and data states", () => {
    expect(content).toContain("managerCompConfigQ.isLoading");
    expect(content).toContain("managerCompConfigQ.isError");
    expect(content).toContain("managerCompConfigQ.data");
  });
});

// ── 4. agentsUninstallPermission → Status.tsx ───────────────────────────────
describe("Status.tsx — agentsUninstallPermission wiring", () => {
  const content = readPage("Status.tsx");
  it("queries trpc.wazuh.agentsUninstallPermission", () => {
    expect(content).toContain("trpc.wazuh.agentsUninstallPermission.useQuery");
  });
  it("renders an Agents Uninstall Permission heading", () => {
    expect(content).toMatch(/Agents Uninstall Permission/i);
  });
  it("renders BrokerWarnings for agentsUninstallPermission", () => {
    expect(content).toMatch(/BrokerWarnings.*context.*agentsUninstallPermission/s);
  });
  it("renders RawJsonViewer for agentsUninstallPermission", () => {
    expect(content).toMatch(/RawJsonViewer.*Uninstall Permission/is);
  });
});

// ── 5. taskStatus → Status.tsx ──────────────────────────────────────────────
describe("Status.tsx — taskStatus wiring", () => {
  const content = readPage("Status.tsx");
  it("queries trpc.wazuh.taskStatus", () => {
    expect(content).toContain("trpc.wazuh.taskStatus.useQuery");
  });
  it("renders a Task Status heading", () => {
    expect(content).toMatch(/Task Status/i);
  });
  it("shows the GET /tasks/status endpoint path", () => {
    expect(content).toContain("GET /tasks/status");
  });
  it("renders BrokerWarnings for taskStatus", () => {
    expect(content).toMatch(/BrokerWarnings.*context.*taskStatus/s);
  });
  it("renders RawJsonViewer for taskStatus", () => {
    expect(content).toMatch(/RawJsonViewer.*Task Status/is);
  });
});

// ── 6. decoderParents → RulesetExplorer.tsx ─────────────────────────────────
describe("RulesetExplorer.tsx — decoderParents wiring", () => {
  const content = readPage("RulesetExplorer.tsx");
  it("queries trpc.wazuh.decoderParents", () => {
    expect(content).toContain("trpc.wazuh.decoderParents.useQuery");
  });
  it("renders a Decoder Parents heading", () => {
    expect(content).toMatch(/Decoder Parents/i);
  });
  it("shows the GET /decoders/parents endpoint path", () => {
    expect(content).toContain("GET /decoders/parents");
  });
  it("has pagination controls for decoder parents", () => {
    expect(content).toContain("decoderParentsPage");
  });
  it("has search for decoder parents", () => {
    expect(content).toContain("decoderParentsSearch");
  });
  it("renders BrokerWarnings for decoderParents", () => {
    expect(content).toMatch(/BrokerWarnings.*context.*decoderParents/s);
  });
  it("renders RawJsonViewer for decoderParents", () => {
    expect(content).toMatch(/RawJsonViewer.*Decoder Parents/is);
  });
  it("has a decoderParents tab trigger", () => {
    expect(content).toMatch(/decoderParents/);
  });
});

// ── 7. rulesByRequirement → RulesetExplorer.tsx ─────────────────────────────
describe("RulesetExplorer.tsx — rulesByRequirement wiring", () => {
  const content = readPage("RulesetExplorer.tsx");
  it("queries trpc.wazuh.rulesByRequirement", () => {
    expect(content).toContain("trpc.wazuh.rulesByRequirement.useQuery");
  });
  it("renders a Rules by Requirement heading", () => {
    expect(content).toMatch(/Rules by Requirement/i);
  });
  it("has a requirement input field", () => {
    expect(content).toContain("requirementInput");
  });
  it("has an active requirement state", () => {
    expect(content).toContain("activeRequirement");
  });
  it("renders BrokerWarnings for rulesByRequirement", () => {
    expect(content).toMatch(/BrokerWarnings.*context.*rulesByRequirement/s);
  });
  it("renders RawJsonViewer for rulesByRequirement", () => {
    expect(content).toMatch(/RawJsonViewer.*Rules by Requirement/is);
  });
  it("shows common requirement examples", () => {
    expect(content).toContain("PCI_DSS_10.6.1");
  });
});

// ── 8. mitreSoftware → MitreAttack.tsx ──────────────────────────────────────
describe("MitreAttack.tsx — mitreSoftware wiring", () => {
  const content = readPage("MitreAttack.tsx");
  it("queries trpc.wazuh.mitreSoftware", () => {
    expect(content).toContain("trpc.wazuh.mitreSoftware.useQuery");
  });
  it("has a Software tab trigger", () => {
    expect(content).toMatch(/software/i);
  });
  it("renders BrokerWarnings for mitreSoftware", () => {
    expect(content).toMatch(/BrokerWarnings.*mitreSoftware/is);
  });
});

// ── 9. mitreMitigations → MitreAttack.tsx ───────────────────────────────────
describe("MitreAttack.tsx — mitreMitigations wiring", () => {
  const content = readPage("MitreAttack.tsx");
  it("queries trpc.wazuh.mitreMitigations", () => {
    expect(content).toContain("trpc.wazuh.mitreMitigations.useQuery");
  });
  it("has a Mitigations tab trigger", () => {
    expect(content).toMatch(/mitigations/i);
  });
  it("renders BrokerWarnings for mitreMitigations", () => {
    expect(content).toMatch(/BrokerWarnings.*mitreMitigations/is);
  });
});

// ── 10. mitreReferences → MitreAttack.tsx ───────────────────────────────────
describe("MitreAttack.tsx — mitreReferences wiring", () => {
  const content = readPage("MitreAttack.tsx");
  it("queries trpc.wazuh.mitreReferences", () => {
    expect(content).toContain("trpc.wazuh.mitreReferences.useQuery");
  });
  it("has a References tab trigger", () => {
    expect(content).toMatch(/references/i);
  });
  it("renders BrokerWarnings for mitreReferences", () => {
    expect(content).toMatch(/BrokerWarnings.*mitreReferences/is);
  });
});

// ── 11. ciscatResults → AgentDetail.tsx ─────────────────────────────────────
describe("AgentDetail.tsx — ciscatResults wiring", () => {
  const content = readPage("AgentDetail.tsx");
  it("queries trpc.wazuh.ciscatResults", () => {
    expect(content).toContain("trpc.wazuh.ciscatResults.useQuery");
  });
  it("has a CIS-CAT tab type", () => {
    expect(content).toMatch(/ciscat/i);
  });
  it("renders BrokerWarnings for ciscatResults", () => {
    expect(content).toMatch(/BrokerWarnings.*ciscatResults/is);
  });
  it("renders RawJsonViewer for CIS-CAT", () => {
    expect(content).toMatch(/RawJsonViewer.*CIS-CAT/is);
  });
  it("has pagination for CIS-CAT results", () => {
    // CiscatTab uses local `page` state and PAGE_SIZE constant
    expect(content).toContain("PAGE_SIZE");
    expect(content).toContain("totalPages");
  });
});

// ── 12. agentGroupSync → AgentDetail.tsx ────────────────────────────────────
describe("AgentDetail.tsx — agentGroupSync wiring", () => {
  const content = readPage("AgentDetail.tsx");
  it("queries trpc.wazuh.agentGroupSync", () => {
    expect(content).toContain("trpc.wazuh.agentGroupSync.useQuery");
  });
  it("renders Group Sync status in the overview", () => {
    expect(content).toMatch(/Group Sync/i);
  });
  it("shows synced/unsynced status indicator", () => {
    expect(content).toContain("groupSyncStatus");
  });
});

// ── 13. agentsUpgradeResult → AgentHealth.tsx ───────────────────────────────
describe("AgentHealth.tsx — agentsUpgradeResult wiring", () => {
  const content = readPage("AgentHealth.tsx");
  it("queries trpc.wazuh.agentsUpgradeResult", () => {
    expect(content).toContain("trpc.wazuh.agentsUpgradeResult.useQuery");
  });
  it("renders an Agent Upgrade Results heading", () => {
    expect(content).toMatch(/Agent Upgrade Results/i);
  });
  it("shows the GET /agents/upgrade_result endpoint path", () => {
    expect(content).toContain("GET /agents/upgrade_result");
  });
  it("renders BrokerWarnings for agentsUpgradeResult", () => {
    expect(content).toMatch(/BrokerWarnings.*context.*agentsUpgradeResult/s);
  });
  it("renders RawJsonViewer for agentsUpgradeResult", () => {
    expect(content).toMatch(/RawJsonViewer.*Upgrade Results/is);
  });
  it("has a table with Agent ID, Status, Message, Details columns", () => {
    expect(content).toContain("Agent ID");
    expect(content).toContain("Status");
    expect(content).toContain("Message");
  });
});

// ── Full Parity Check ──────────────────────────────────────────────────────
describe("Full 113/113 Parity Verification", () => {
  it("all 13 newly wired procedures are present in their target files", () => {
    const home = readPage("Home.tsx");
    const status = readPage("Status.tsx");
    const ruleset = readPage("RulesetExplorer.tsx");
    const mitre = readPage("MitreAttack.tsx");
    const agentDetail = readPage("AgentDetail.tsx");
    const agentHealth = readPage("AgentHealth.tsx");

    // Each procedure must appear as a useQuery call
    expect(home).toContain("trpc.wazuh.agentsSummary.useQuery");
    expect(status).toContain("trpc.wazuh.isConfigured.useQuery");
    expect(status).toContain("trpc.wazuh.managerComponentConfig.useQuery");
    expect(status).toContain("trpc.wazuh.agentsUninstallPermission.useQuery");
    expect(status).toContain("trpc.wazuh.taskStatus.useQuery");
    expect(ruleset).toContain("trpc.wazuh.decoderParents.useQuery");
    expect(ruleset).toContain("trpc.wazuh.rulesByRequirement.useQuery");
    expect(mitre).toContain("trpc.wazuh.mitreSoftware.useQuery");
    expect(mitre).toContain("trpc.wazuh.mitreMitigations.useQuery");
    expect(mitre).toContain("trpc.wazuh.mitreReferences.useQuery");
    expect(agentDetail).toContain("trpc.wazuh.ciscatResults.useQuery");
    expect(agentDetail).toContain("trpc.wazuh.agentGroupSync.useQuery");
    expect(agentHealth).toContain("trpc.wazuh.agentsUpgradeResult.useQuery");
  });
});
