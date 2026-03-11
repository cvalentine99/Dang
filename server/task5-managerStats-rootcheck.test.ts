/**
 * Task 5 — Manager Stats + Rootcheck Wiring Tests
 *
 * Covers:
 * 1. managerStats wired to Status.tsx (WazuhApiIntelligence section)
 * 2. mitreMetadata wired to MitreAttack.tsx (new Metadata tab)
 * 3. rootcheckResults + rootcheckLastScan wired to AgentDetail.tsx (new Rootcheck tab)
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── 1. Manager Stats on Status.tsx ──────────────────────────────────────────

describe("Status.tsx — managerStats panel wiring", () => {
  const filePath = path.resolve(__dirname, "../client/src/pages/Status.tsx");

  it("Status.tsx exists", () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("queries trpc.wazuh.managerStats", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("trpc.wazuh.managerStats.useQuery");
  });

  it("renders a Manager Stats panel heading", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("Manager Stats");
  });

  it("shows the GET /manager/stats endpoint path", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("GET /manager/stats");
  });

  it("renders BrokerWarnings for managerStats", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/BrokerWarnings.*context.*managerStats/s);
  });

  it("renders RawJsonViewer for Manager Stats", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/RawJsonViewer.*title.*Manager Stats JSON/s);
  });

  it("uses a 4-column grid for the intelligence panels", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/xl:grid-cols-4/);
  });

  it("handles loading, error, and data states for managerStats", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("managerStatsQ.isLoading");
    expect(content).toContain("managerStatsQ.isError");
    expect(content).toContain("managerStatsQ.data");
  });
});

// ── 2. MITRE Metadata on MitreAttack.tsx ────────────────────────────────────

describe("MitreAttack.tsx — mitreMetadata tab wiring", () => {
  const filePath = path.resolve(__dirname, "../client/src/pages/MitreAttack.tsx");

  it("MitreAttack.tsx exists", () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("queries trpc.wazuh.mitreMetadata", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("trpc.wazuh.mitreMetadata.useQuery");
  });

  it("has a Metadata tab trigger", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/TabsTrigger.*value.*metadata/s);
  });

  it("has a Metadata TabsContent", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/TabsContent.*value.*metadata/s);
  });

  it("renders RawJsonViewer for MITRE Metadata", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/RawJsonViewer.*title.*MITRE Metadata JSON/s);
  });

  it("renders BrokerWarnings for mitreMetadata", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/BrokerWarnings.*context.*mitreMetadata/s);
  });

  it("imports BrokerWarnings", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/import.*BrokerWarnings.*from/);
  });

  it("imports Info icon for the metadata tab", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    // Multi-line import: Info is on a separate line from 'from "lucide-react"'
    expect(content).toMatch(/\bInfo\b/);
    expect(content).toContain('from "lucide-react"');
  });

  it("handles loading, error, and data states for mitreMetadata", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("mitreMetadataQ.isLoading");
    expect(content).toContain("mitreMetadataQ.isError");
    expect(content).toContain("mitreMetadataQ.data");
  });
});

// ── 3. Rootcheck on AgentDetail.tsx ─────────────────────────────────────────

describe("AgentDetail.tsx — Rootcheck tab wiring", () => {
  const filePath = path.resolve(__dirname, "../client/src/pages/AgentDetail.tsx");

  it("AgentDetail.tsx exists", () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("includes rootcheck in the Tab type union", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/type Tab\s*=.*"rootcheck"/);
  });

  it("has a Rootcheck entry in the TABS array", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/id:\s*"rootcheck"/);
    expect(content).toMatch(/label:\s*"Rootcheck"/);
  });

  it("renders RootcheckTab when activeTab is rootcheck", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/activeTab\s*===\s*"rootcheck".*RootcheckTab/s);
  });

  it("queries trpc.wazuh.rootcheckResults", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("trpc.wazuh.rootcheckResults.useQuery");
  });

  it("queries trpc.wazuh.rootcheckLastScan", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("trpc.wazuh.rootcheckLastScan.useQuery");
  });

  it("passes agentId to rootcheckResults query", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/rootcheckResults\.useQuery\(\s*\{[^}]*agentId/s);
  });

  it("passes agentId to rootcheckLastScan query", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/rootcheckLastScan\.useQuery\(\s*\{[^}]*agentId/s);
  });

  it("renders RawJsonViewer for rootcheck results", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/RawJsonViewer.*title.*Rootcheck Results JSON/s);
  });

  it("renders RawJsonViewer for last scan", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/RawJsonViewer.*title.*Last Scan JSON/s);
  });

  it("renders BrokerWarnings for rootcheckResults", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/BrokerWarnings.*context.*rootcheckResults/s);
  });

  it("renders BrokerWarnings for rootcheckLastScan", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/BrokerWarnings.*context.*rootcheckLastScan/s);
  });

  it("has status filter for rootcheck results", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/statusFilter/);
    expect(content).toMatch(/outstanding/);
    expect(content).toMatch(/solved/);
  });

  it("has search filter for rootcheck results", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/searchTerm/);
    expect(content).toMatch(/search.*searchTerm/s);
  });

  it("has PCI-DSS filter for rootcheck results", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/pciFilter/);
    expect(content).toMatch(/pci_dss.*pciFilter/s);
  });

  it("has CIS filter for rootcheck results", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/cisFilter/);
    expect(content).toMatch(/cis.*cisFilter/s);
  });

  it("has pagination for rootcheck results", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/setPage/);
    expect(content).toMatch(/PAGE_SIZE/);
    expect(content).toMatch(/totalPages/);
  });

  it("uses ShieldAlert icon for the rootcheck tab", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/ShieldAlert.*rootcheck|rootcheck.*ShieldAlert/s);
  });

  it("shows rootcheck status colors for outstanding and solved", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("ROOTCHECK_STATUS_COLORS");
    expect(content).toMatch(/outstanding.*oklch/s);
    expect(content).toMatch(/solved.*oklch/s);
  });
});
