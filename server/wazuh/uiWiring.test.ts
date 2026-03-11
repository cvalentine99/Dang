/**
 * UI Wiring Tests — Sprint v2 Endpoint → UI Integration
 *
 * Verifies that the 26 new Sprint v2 endpoints are properly wired:
 * 1. Fleet Inventory page consumes all experimental syscollector endpoints
 * 2. Cluster Health page consumes all per-node cluster endpoints
 * 3. Security Explorer page consumes all RBAC endpoints + current user policies
 * 4. Navigation entries exist for new pages
 * 5. Routes are registered in App.tsx
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");

function readFile(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("Fleet Inventory Page — Syscollector Endpoint Wiring", () => {
  const src = readFile("client/src/pages/FleetInventory.tsx");

  const syscollectorEndpoints = [
    "expSyscollectorPackages",
    "expSyscollectorProcesses",
    "expSyscollectorPorts",
    "expSyscollectorNetaddr",
    "expSyscollectorNetiface",
    "expSyscollectorHardware",
    "expSyscollectorOs",
    "expSyscollectorHotfixes",
    "expSyscollectorNetproto",
  ];

  it.each(syscollectorEndpoints)(
    "should consume trpc.wazuh.%s",
    (endpoint) => {
      expect(src).toContain(endpoint);
    }
  );

  it("should have tab navigation for inventory categories", () => {
    const tabs = ["Packages", "Processes", "Ports", "Hardware", "Hotfixes"];
    for (const tab of tabs) {
      expect(src).toContain(tab);
    }
  });

  it("should include pagination controls", () => {
    expect(src).toMatch(/offset|page|limit/i);
  });

  it("should include search/filter capability", () => {
    expect(src).toMatch(/search|filter|Search|Filter/);
  });

  it("should include raw JSON viewer for forensic access", () => {
    expect(src).toContain("RawJsonViewer");
  });

  it("should use GlassPanel for Amethyst Nexus theme", () => {
    expect(src).toContain("GlassPanel");
  });

  it("should use connection status gating", () => {
    expect(src).toMatch(/status|isConnected|WazuhGuard/);
  });
});

describe("Cluster Health Page — Per-Node Drill-Down Wiring", () => {
  const src = readFile("client/src/pages/ClusterHealth.tsx");

  const clusterEndpoints = [
    "clusterNodeStatus",
    "clusterNodeConfiguration",
    "clusterNodeDaemonStats",
    "clusterNodeLogs",
    "clusterNodeLogsSummary",
    "clusterNodeStatsAnalysisd",
    "clusterNodeStatsRemoted",
    "clusterNodeStatsWeekly",
  ];

  it.each(clusterEndpoints)(
    "should consume trpc.wazuh.%s",
    (endpoint) => {
      expect(src).toContain(endpoint);
    }
  );

  it("should have node drill-down component", () => {
    expect(src).toMatch(/NodeDrillDown|nodeDrillDown/);
  });

  it("should include per-node log viewer with pagination", () => {
    expect(src).toMatch(/logPage|logSearch/);
  });

  it("should include per-node daemon status display", () => {
    expect(src).toMatch(/Daemon Status|daemon/i);
  });

  it("should include per-node analysisd stats", () => {
    expect(src).toMatch(/Analysisd|analysisd/);
  });

  it("should include per-node remoted stats", () => {
    expect(src).toMatch(/Remoted|remoted/);
  });

  it("should include weekly stats chart", () => {
    expect(src).toMatch(/Weekly Stats|nodeWeekly/);
  });

  it("should include raw JSON viewer for forensic access", () => {
    expect(src).toContain("RawJsonViewer");
  });
});

describe("Security Explorer Page — RBAC Endpoint Wiring", () => {
  const src = readFile("client/src/pages/SecurityExplorer.tsx");

  const securityEndpoints = [
    "securityRbacRules",
    "securityActions",
    "securityResources",
    "securityCurrentUserPolicies",
  ];

  it.each(securityEndpoints)(
    "should consume trpc.wazuh.%s",
    (endpoint) => {
      expect(src).toContain(endpoint);
    }
  );

  it("should have tab navigation for RBAC categories", () => {
    const tabs = ["Rules", "Actions", "Resources", "Policies"];
    for (const tab of tabs) {
      expect(src).toContain(tab);
    }
  });

  it("should include raw JSON viewer for forensic access", () => {
    expect(src).toContain("RawJsonViewer");
  });

  it("should use GlassPanel for Amethyst Nexus theme", () => {
    expect(src).toContain("GlassPanel");
  });

  it("should use connection status gating", () => {
    expect(src).toMatch(/status|isConnected|WazuhGuard/);
  });
});

describe("Navigation & Route Registration", () => {
  const appSrc = readFile("client/src/App.tsx");
  const layoutSrc = readFile("client/src/components/DashboardLayout.tsx");

  it("should import FleetInventory page in App.tsx", () => {
    expect(appSrc).toContain("FleetInventory");
  });

  it("should import SecurityExplorer page in App.tsx", () => {
    expect(appSrc).toContain("SecurityExplorer");
  });

  it("should register /fleet-inventory route", () => {
    expect(appSrc).toContain("/fleet-inventory");
  });

  it("should register /security route", () => {
    expect(appSrc).toContain("/security");
  });

  it("should have Fleet Inventory nav item in sidebar", () => {
    expect(layoutSrc).toContain("Fleet Inventory");
    expect(layoutSrc).toContain("/fleet-inventory");
  });

  it("should have Security Explorer nav item in sidebar", () => {
    expect(layoutSrc).toContain("Security Explorer");
    expect(layoutSrc).toContain("/security");
  });

  it("should place Fleet Inventory in Posture group", () => {
    const match = layoutSrc.match(/Fleet Inventory.*?group:\s*"(\w+)"/s);
    expect(match?.[1]).toBe("Posture");
  });

  it("should place Security Explorer in System group", () => {
    const match = layoutSrc.match(/Security Explorer.*?group:\s*"(\w+)"/s);
    expect(match?.[1]).toBe("System");
  });
});

describe("Amethyst Nexus Theme Compliance", () => {
  const fleetSrc = readFile("client/src/pages/FleetInventory.tsx");
  const secSrc = readFile("client/src/pages/SecurityExplorer.tsx");
  const clusterSrc = readFile("client/src/pages/ClusterHealth.tsx");

  it("should use GlassPanel in Fleet Inventory", () => {
    expect(fleetSrc).toContain("GlassPanel");
  });

  it("should use GlassPanel in Security Explorer", () => {
    expect(secSrc).toContain("GlassPanel");
  });

  it("should use GlassPanel in Cluster Health", () => {
    expect(clusterSrc).toContain("GlassPanel");
  });

  it("should use PageHeader in Fleet Inventory", () => {
    expect(fleetSrc).toContain("PageHeader");
  });

  it("should use PageHeader in Security Explorer", () => {
    expect(secSrc).toContain("PageHeader");
  });

  it("should use font-mono for technical data in Fleet Inventory", () => {
    expect(fleetSrc).toContain("font-mono");
  });

  it("should use font-mono for technical data in Security Explorer", () => {
    expect(secSrc).toContain("font-mono");
  });
});

describe("Read-Only Safeguards", () => {
  const fleetSrc = readFile("client/src/pages/FleetInventory.tsx");
  const secSrc = readFile("client/src/pages/SecurityExplorer.tsx");

  it("should not contain mutation calls in Fleet Inventory", () => {
    expect(fleetSrc).not.toMatch(/useMutation/);
  });

  it("should not contain mutation calls in Security Explorer", () => {
    expect(secSrc).not.toMatch(/useMutation/);
  });

  it("should only use GET-based tRPC queries in Fleet Inventory", () => {
    expect(fleetSrc).toContain("useQuery");
    expect(fleetSrc).not.toMatch(/\.useMutation\(/);
  });

  it("should only use GET-based tRPC queries in Security Explorer", () => {
    expect(secSrc).toContain("useQuery");
    expect(secSrc).not.toMatch(/\.useMutation\(/);
  });
});
