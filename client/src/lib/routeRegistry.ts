/**
 * Route Registry — single source of truth for page→route mappings.
 *
 * Both App.tsx and routeInference.ts consume this registry.
 * Adding, removing, or renaming a route here automatically propagates
 * to the router and the admin cockpit drill-through.
 *
 * IMPORTANT: When you add a new page, add it here — not in App.tsx directly.
 * App.tsx renders routes from this registry.
 */

import type { ComponentType } from "react";

export interface RouteEntry {
  /** URL path pattern (e.g. "/agents", "/fleet/:agentId") */
  path: string;
  /** Page component name — must match the default export name from pages/ */
  pageName: string;
  /** Lazy-loaded or directly imported component. Set at App.tsx import time. */
  component?: ComponentType<any>;
  /** Whether this route is outside the DashboardLayout (auth routes) */
  auth?: boolean;
}

/**
 * Every page route in the app. Order matters for wouter's <Switch>:
 * more-specific paths should come before catch-alls.
 *
 * The `component` field is intentionally omitted here — it is populated
 * by App.tsx after importing page components. This keeps the registry
 * free of heavyweight component imports so routeInference can consume
 * it without pulling in React page bundles.
 */
export const ROUTE_REGISTRY: RouteEntry[] = [
  // ── Auth (outside DashboardLayout) ──
  { path: "/login", pageName: "Login", auth: true },
  { path: "/register", pageName: "Register", auth: true },

  // ── Dashboard ──
  { path: "/", pageName: "Home" },
  { path: "/agents", pageName: "AgentHealth" },
  { path: "/fleet/:agentId", pageName: "AgentDetail" },
  { path: "/fleet-compare", pageName: "AgentCompare" },
  { path: "/alerts", pageName: "AlertsTimeline" },
  { path: "/vulnerabilities", pageName: "Vulnerabilities" },
  { path: "/mitre", pageName: "MitreAttack" },
  { path: "/compliance", pageName: "Compliance" },
  { path: "/fim", pageName: "FileIntegrity" },
  { path: "/hygiene", pageName: "ITHygiene" },
  { path: "/cluster", pageName: "ClusterHealth" },
  { path: "/siem", pageName: "SiemEvents" },
  { path: "/hunting", pageName: "ThreatHunting" },
  { path: "/rules", pageName: "RulesetExplorer" },
  { path: "/threat-intel", pageName: "ThreatIntel" },
  { path: "/notes", pageName: "AnalystNotes" },
  { path: "/assistant", pageName: "Assistant" },
  { path: "/status", pageName: "Status" },
  { path: "/admin/users", pageName: "AdminUsers" },
  { path: "/admin/settings", pageName: "AdminSettings" },
  { path: "/admin/token-usage", pageName: "TokenUsage" },
  { path: "/analyst", pageName: "AnalystChat" },
  { path: "/graph", pageName: "KnowledgeGraph" },
  { path: "/investigations", pageName: "Investigations" },
  { path: "/pipeline", pageName: "DataPipeline" },
  { path: "/alert-queue", pageName: "AlertQueue" },
  { path: "/auto-queue-rules", pageName: "AutoQueueRules" },
  { path: "/triage", pageName: "TriagePipeline" },
  { path: "/living-cases", pageName: "LivingCaseView" },
  { path: "/living-cases/:id", pageName: "LivingCaseView" },
  { path: "/response-actions", pageName: "ResponseActions" },
  { path: "/pipeline-inspector", pageName: "PipelineInspector" },
  { path: "/feedback-analytics", pageName: "FeedbackAnalytics" },
  { path: "/drift-analytics", pageName: "DriftAnalytics" },
  { path: "/fleet-inventory", pageName: "FleetInventory" },
  { path: "/security", pageName: "SecurityExplorer" },
  { path: "/admin/audit", pageName: "SensitiveAccessAudit" },
  { path: "/groups", pageName: "GroupManagement" },
  { path: "/admin/broker-coverage", pageName: "BrokerCoverage" },
  { path: "/admin/dgx-health", pageName: "DGXHealth" },
  { path: "/admin/broker-playground", pageName: "BrokerPlayground" },
];

/**
 * Pre-built pageName→path lookup. For pages with multiple routes
 * (e.g. LivingCaseView), the first (most specific) route wins.
 */
export const PAGE_ROUTE_MAP: Record<string, string> = {};
for (const entry of ROUTE_REGISTRY) {
  if (!PAGE_ROUTE_MAP[entry.pageName]) {
    PAGE_ROUTE_MAP[entry.pageName] = entry.path;
  }
}
