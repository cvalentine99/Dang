/**
 * Route inference — resolves callsite file paths to owning app routes.
 *
 * Consumes the shared route registry so it cannot drift from App.tsx.
 * Used by Broker Coverage to provide owning-page drill-through.
 */

import { PAGE_ROUTE_MAP } from "./routeRegistry";

export interface InferredRoute {
  pageName: string;
  route: string;
  /** Routes with path params (e.g. :agentId) are ambiguous for direct navigation */
  hasParams: boolean;
}

/**
 * Extract page name from a callsite path.
 * "client/src/pages/AgentHealth.tsx:87" → "AgentHealth"
 * "client/src/hooks/useAlertStream.ts:12" → null (not a page)
 */
function extractPageName(callsitePath: string): string | null {
  const match = callsitePath.match(/\/pages\/([A-Za-z0-9]+)\.\w+/);
  return match ? match[1] : null;
}

/**
 * Infer the owning route from a callsite file path.
 * Returns null if the callsite is not in a known page file.
 */
export function inferRouteFromCallsite(callsitePath: string): InferredRoute | null {
  const pageName = extractPageName(callsitePath);
  if (!pageName) return null;
  const route = PAGE_ROUTE_MAP[pageName];
  if (!route) return null;
  return { pageName, route, hasParams: route.includes(":") };
}

/**
 * Admin/internal page names — used to deprioritize admin pages
 * when a user-facing page also consumes the same procedure.
 */
const ADMIN_PAGES = new Set([
  "AdminUsers", "AdminSettings", "TokenUsage", "SensitiveAccessAudit",
  "BrokerCoverage", "BrokerPlayground", "DGXHealth", "ComponentShowcase",
]);

/**
 * Infer the best owning route for an endpoint from all its callsites.
 *
 * Ranking heuristic (applied to param-free routes only):
 * 1. Frequency — routes with more callsites are stronger owners
 * 2. User-facing pages preferred over admin/internal pages
 *    (unless ALL callsites are admin pages)
 * 3. Falls back to parameterized routes only if no param-free route exists
 */
export function inferPrimaryRoute(callsites: string[]): InferredRoute | null {
  // Tally callsite frequency per route
  const freq = new Map<string, { route: InferredRoute; count: number }>();
  for (const cs of callsites) {
    const inferred = inferRouteFromCallsite(cs);
    if (!inferred) continue;
    const existing = freq.get(inferred.route);
    if (existing) {
      existing.count++;
    } else {
      freq.set(inferred.route, { route: inferred, count: 1 });
    }
  }

  if (freq.size === 0) return null;

  // Separate param-free from parameterized
  const paramFree: Array<{ route: InferredRoute; count: number }> = [];
  const parameterized: Array<{ route: InferredRoute; count: number }> = [];

  freq.forEach(entry => {
    if (entry.route.hasParams) {
      parameterized.push(entry);
    } else {
      paramFree.push(entry);
    }
  });

  // Pick from param-free routes first
  if (paramFree.length > 0) {
    paramFree.sort((a, b) => {
      // Prefer user-facing pages over admin pages
      const aAdmin = ADMIN_PAGES.has(a.route.pageName) ? 1 : 0;
      const bAdmin = ADMIN_PAGES.has(b.route.pageName) ? 1 : 0;
      if (aAdmin !== bAdmin) return aAdmin - bAdmin;
      // Then by frequency (descending)
      return b.count - a.count;
    });
    return paramFree[0].route;
  }

  // Fall back to parameterized routes, sorted by frequency
  if (parameterized.length > 0) {
    parameterized.sort((a, b) => b.count - a.count);
    return parameterized[0].route;
  }

  return null;
}

/**
 * Get all unique inferred routes from a set of callsites.
 */
export function inferAllRoutes(callsites: string[]): InferredRoute[] {
  const seen = new Set<string>();
  const results: InferredRoute[] = [];
  for (const cs of callsites) {
    const inferred = inferRouteFromCallsite(cs);
    if (inferred && !seen.has(inferred.route)) {
      seen.add(inferred.route);
      results.push(inferred);
    }
  }
  return results;
}
