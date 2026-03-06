/**
 * Wiring Sprint Audit — Feature Tests
 * 
 * Verifies Tasks 2-4:
 *   Task 2: Agent pivot links on AlertsTimeline + Vulnerabilities
 *   Task 3: Saved searches on AlertsTimeline, Vulnerabilities, AgentHealth
 *   Task 4: CSV export on decoderParents, rulesByReq, CIS-CAT, upgradeResults
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const CLIENT = join(__dirname, "..", "client", "src");

function readPage(name: string): string {
  return readFileSync(join(CLIENT, "pages", name), "utf-8");
}

function readComponent(path: string): string {
  return readFileSync(join(CLIENT, path), "utf-8");
}

// ── Task 2: Agent Pivot Links ──────────────────────────────────────────────

describe("Task 2: Agent Pivot Links", () => {
  describe("AlertsTimeline.tsx", () => {
    const src = readPage("AlertsTimeline.tsx");

    it("imports useLocation from wouter", () => {
      expect(src).toMatch(/useLocation.*from.*wouter/);
    });

    it("has navigate function from useLocation", () => {
      expect(src).toMatch(/const\s*\[.*,\s*navigate\s*\]\s*=\s*useLocation/);
    });

    it("navigates to /fleet/:agentId on agent click in table", () => {
      expect(src).toMatch(/navigate\(`\/fleet\/\$/);
    });

    it("has cursor-pointer styling on agent cells", () => {
      expect(src).toMatch(/cursor-pointer.*text-primary|text-primary.*cursor-pointer/);
    });
  });

  describe("Vulnerabilities.tsx", () => {
    const src = readPage("Vulnerabilities.tsx");

    it("imports useLocation from wouter", () => {
      expect(src).toMatch(/useLocation.*from.*wouter/);
    });

    it("has navigate function from useLocation", () => {
      expect(src).toMatch(/const\s*\[.*,\s*navigate\s*\]\s*=\s*useLocation/);
    });

    it("navigates to /fleet/:agentId on agent click", () => {
      expect(src).toMatch(/navigate\(`\/fleet\/\$/);
    });
  });
});

// ── Task 3: Saved Searches ─────────────────────────────────────────────────

describe("Task 3: Saved Searches on 3 Pages", () => {
  describe("SavedSearchPanel component", () => {
    const src = readComponent("components/shared/SavedSearchPanel.tsx");

    it("exists and exports SavedSearchPanel", () => {
      expect(src).toMatch(/export\s+function\s+SavedSearchPanel/);
    });

    it("uses trpc.savedSearches.list.useQuery", () => {
      expect(src).toMatch(/trpc\.savedSearches\.list\.useQuery/);
    });

    it("uses trpc.savedSearches.create.useMutation", () => {
      expect(src).toMatch(/trpc\.savedSearches\.create\.useMutation/);
    });

    it("uses trpc.savedSearches.delete.useMutation", () => {
      expect(src).toMatch(/trpc\.savedSearches\.delete\.useMutation/);
    });

    it("accepts typed searchType prop (derived from shared constant)", () => {
      // Now uses SavedSearchType from shared/searchTypes.ts instead of inline union
      expect(src).toMatch(/import.*SavedSearchType.*from.*searchTypes/);
      expect(src).toMatch(/searchType:\s*SavedSearchType/);
    });
  });

  describe("AlertsTimeline.tsx", () => {
    const src = readPage("AlertsTimeline.tsx");

    it("imports SavedSearchPanel", () => {
      expect(src).toMatch(/import.*SavedSearchPanel.*from/);
    });

    it("renders SavedSearchPanel with searchType='alerts'", () => {
      expect(src).toMatch(/searchType="alerts"/);
    });

    it("provides getCurrentFilters callback", () => {
      expect(src).toMatch(/getCurrentFilters=\{/);
    });

    it("provides onLoadSearch callback", () => {
      expect(src).toMatch(/onLoadSearch=\{/);
    });
  });

  describe("Vulnerabilities.tsx", () => {
    const src = readPage("Vulnerabilities.tsx");

    it("imports SavedSearchPanel", () => {
      expect(src).toMatch(/import.*SavedSearchPanel.*from/);
    });

    it("renders SavedSearchPanel with searchType='vulnerabilities'", () => {
      expect(src).toMatch(/searchType="vulnerabilities"/);
    });
  });

  describe("AgentHealth.tsx", () => {
    const src = readPage("AgentHealth.tsx");

    it("imports SavedSearchPanel", () => {
      expect(src).toMatch(/import.*SavedSearchPanel.*from/);
    });

    it("renders SavedSearchPanel with searchType='fleet'", () => {
      expect(src).toMatch(/searchType="fleet"/);
    });
  });

  describe("Schema enum — shared constant", () => {
    const schema = readFileSync(join(__dirname, "..", "drizzle", "schema.ts"), "utf-8");

    it("schema imports SAVED_SEARCH_TYPES from shared constant", () => {
      expect(schema).toMatch(/import.*SAVED_SEARCH_TYPES.*from.*searchTypes/);
    });

    it("schema uses spread of SAVED_SEARCH_TYPES for enum", () => {
      expect(schema).toMatch(/mysqlEnum.*searchType.*SAVED_SEARCH_TYPES/);
    });

    const sharedConst = readFileSync(join(__dirname, "..", "shared", "searchTypes.ts"), "utf-8");
    it("shared constant includes all 5 search types", () => {
      expect(sharedConst).toMatch(/siem/);
      expect(sharedConst).toMatch(/hunting/);
      expect(sharedConst).toMatch(/alerts/);
      expect(sharedConst).toMatch(/vulnerabilities/);
      expect(sharedConst).toMatch(/fleet/);
    });
  });
});

// ── Task 4: CSV Export on 4 New Tables ─────────────────────────────────────

describe("Task 4: CSV Export Buttons", () => {
  describe("RulesetExplorer.tsx — decoderParents", () => {
    const src = readPage("RulesetExplorer.tsx");

    it("imports ExportButton", () => {
      expect(src).toMatch(/import.*ExportButton.*from/);
    });

    it("has ExportButton with baseName='decoder-parents'", () => {
      expect(src).toMatch(/baseName="decoder-parents"/);
    });

    it("has column definitions for decoder parents export", () => {
      expect(src).toMatch(/key:\s*"name".*label:\s*"Name"/);
    });
  });

  describe("RulesetExplorer.tsx — rulesByRequirement", () => {
    const src = readPage("RulesetExplorer.tsx");

    it("has ExportButton with baseName='rules-by-requirement'", () => {
      expect(src).toMatch(/baseName="rules-by-requirement"/);
    });

    it("passes activeRequirement as context", () => {
      expect(src).toMatch(/context=\{activeRequirement\}/);
    });

    it("has column definitions for rules export", () => {
      expect(src).toMatch(/key:\s*"id".*label:\s*"Rule ID"/);
    });
  });

  describe("AgentDetail.tsx — CIS-CAT results", () => {
    const src = readPage("AgentDetail.tsx");

    it("imports ExportButton", () => {
      expect(src).toMatch(/import.*ExportButton.*from/);
    });

    it("has ExportButton with baseName='ciscat-results'", () => {
      expect(src).toMatch(/baseName="ciscat-results"/);
    });

    it("has column definitions for CIS-CAT export", () => {
      expect(src).toMatch(/key:\s*"benchmark".*label:\s*"Benchmark"/);
    });

    it("passes agent context to export", () => {
      expect(src).toMatch(/context=\{`agent-\$\{agentId\}`\}/);
    });
  });

  describe("AgentHealth.tsx — upgrade results", () => {
    const src = readPage("AgentHealth.tsx");

    it("imports ExportButton", () => {
      expect(src).toMatch(/import.*ExportButton.*from/);
    });

    it("has ExportButton with baseName='upgrade-results'", () => {
      expect(src).toMatch(/baseName="upgrade-results"/);
    });

    it("has column definitions for upgrade results export", () => {
      expect(src).toMatch(/key:\s*"status".*label:\s*"Status"/);
    });
  });
});
