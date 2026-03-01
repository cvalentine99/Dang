/**
 * Wazuh Indexer tRPC Router — read-only queries against all 5 index patterns.
 *
 * All endpoints require authentication and are GET-equivalent (POST /_search is read-only in Elasticsearch).
 * No mutations, no index writes, no cluster management.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  isIndexerConfigured,
  getIndexerConfig,
  getEffectiveIndexerConfig,
  isIndexerEffectivelyConfigured,
  indexerSearch,
  indexerHealth,
  indexerIndexExists,
  INDEX_PATTERNS,
  timeRangeFilter,
  boolQuery,
  dateHistogramAgg,
  termsAgg,
  type ESSearchBody,
} from "./indexerClient";

// ── Shared schemas ───────────────────────────────────────────────────────────
const timeRangeSchema = z.object({
  from: z.string().default("now-24h"),
  to: z.string().default("now"),
});

const paginationSchema = z.object({
  size: z.number().int().min(0).max(500).default(20),
  offset: z.number().int().min(0).default(0),
});

// ── Helper: safe search with fallback (uses DB override → env fallback) ─────
async function safeSearch(
  index: string,
  body: ESSearchBody,
  rateLimitGroup: string
) {
  const config = await getEffectiveIndexerConfig();
  if (!config) {
    return { configured: false, data: null };
  }
  try {
    const data = await indexerSearch(config, index, body, rateLimitGroup);
    return { configured: true, data };
  } catch (err) {
    return { configured: true, data: null, error: (err as Error).message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INDEXER ROUTER
// ═══════════════════════════════════════════════════════════════════════════════
export const indexerRouter = router({
  // ── Status ─────────────────────────────────────────────────────────────────
  status: protectedProcedure.query(async () => {
    const config = await getEffectiveIndexerConfig();
    if (!config) {
      return { configured: false, healthy: false, data: null };
    }
    try {
      const health = await indexerHealth(config);
      return { configured: true, healthy: true, data: health };
    } catch (err) {
      return { configured: true, healthy: false, data: null, error: (err as Error).message };
    }
  }),

  /** Check which index patterns exist */
  indexStatus: protectedProcedure.query(async () => {
    const config = await getEffectiveIndexerConfig();
    if (!config) {
      return { configured: false, indices: {} };
    }
    const indices: Record<string, boolean> = {};
    for (const [name, pattern] of Object.entries(INDEX_PATTERNS)) {
      try {
        indices[name] = await indexerIndexExists(config, pattern);
      } catch {
        indices[name] = false;
      }
    }
    return { configured: true, indices };
  }),

  // ═════════════════════════════════════════════════════════════════════════════
  // wazuh-alerts-* — Security alerts from ruleset
  // ═════════════════════════════════════════════════════════════════════════════

  /** Full-text alert search with filters */
  alertsSearch: protectedProcedure
    .input(
      z.object({
        ...timeRangeSchema.shape,
        ...paginationSchema.shape,
        query: z.string().optional(),
        agentId: z.string().optional(),
        ruleLevel: z.number().int().min(0).max(16).optional(),
        ruleLevelMin: z.number().int().min(0).max(16).optional(),
        mitreTactic: z.string().optional(),
        mitreTechnique: z.string().optional(),
        ruleId: z.string().optional(),
        srcip: z.string().optional(),
        geoCountry: z.string().optional(),
        sortField: z.enum(["timestamp", "rule.level", "agent.id"]).default("timestamp"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      })
    )
    .query(async ({ input }) => {
      const filters: Array<Record<string, unknown>> = [
        timeRangeFilter(input.from, input.to),
      ];

      if (input.agentId) filters.push({ term: { "agent.id": input.agentId } });
      if (input.ruleLevel !== undefined) filters.push({ term: { "rule.level": input.ruleLevel } });
      if (input.ruleLevelMin !== undefined) filters.push({ range: { "rule.level": { gte: input.ruleLevelMin } } });
      if (input.mitreTactic) filters.push({ term: { "rule.mitre.tactic": input.mitreTactic } });
      if (input.mitreTechnique) filters.push({ term: { "rule.mitre.id": input.mitreTechnique } });
      if (input.ruleId) filters.push({ term: { "rule.id": input.ruleId } });
      if (input.srcip) filters.push({ term: { "data.srcip": input.srcip } });
      if (input.geoCountry) filters.push({ term: { "GeoLocation.country_name": input.geoCountry } });

      const must: Array<Record<string, unknown>> = [];
      if (input.query) {
        must.push({
          multi_match: {
            query: input.query,
            fields: ["rule.description", "agent.name", "data.*", "full_log"],
            type: "best_fields",
          },
        });
      }

      return safeSearch(
        INDEX_PATTERNS.ALERTS,
        {
          query: boolQuery({ must, filter: filters }),
          size: input.size,
          from: input.offset,
          sort: [{ [input.sortField]: { order: input.sortOrder } }],
        },
        "alerts"
      );
    }),

  /** Alert severity distribution over time (date_histogram + terms on rule.level) */
  alertsAggByLevel: protectedProcedure
    .input(timeRangeSchema.extend({ interval: z.string().default("1h") }))
    .query(async ({ input }) => {
      return safeSearch(
        INDEX_PATTERNS.ALERTS,
        {
          query: boolQuery({ filter: [timeRangeFilter(input.from, input.to)] }),
          size: 0,
          aggs: {
            timeline: {
              ...dateHistogramAgg("timestamp", input.interval),
              aggs: {
                levels: termsAgg("rule.level", 16),
              },
            },
            severity_total: termsAgg("rule.level", 16),
          },
        },
        "alerts"
      );
    }),

  /** Top agents by alert count (top talkers) */
  alertsAggByAgent: protectedProcedure
    .input(timeRangeSchema.extend({ topN: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      return safeSearch(
        INDEX_PATTERNS.ALERTS,
        {
          query: boolQuery({ filter: [timeRangeFilter(input.from, input.to)] }),
          size: 0,
          aggs: {
            top_agents: {
              ...termsAgg("agent.id", input.topN),
              aggs: {
                agent_name: termsAgg("agent.name", 1),
                avg_level: { avg: { field: "rule.level" } },
              },
            },
          },
        },
        "alerts"
      );
    }),

  /** MITRE ATT&CK tactic/technique distribution */
  alertsAggByMitre: protectedProcedure
    .input(timeRangeSchema.extend({ interval: z.string().default("1d") }))
    .query(async ({ input }) => {
      return safeSearch(
        INDEX_PATTERNS.ALERTS,
        {
          query: boolQuery({
            filter: [
              timeRangeFilter(input.from, input.to),
              { exists: { field: "rule.mitre.tactic" } },
            ],
          }),
          size: 0,
          aggs: {
            tactics: {
              ...termsAgg("rule.mitre.tactic", 20),
              aggs: {
                techniques: termsAgg("rule.mitre.id", 20),
                over_time: dateHistogramAgg("timestamp", input.interval),
              },
            },
            techniques_total: termsAgg("rule.mitre.id", 30),
          },
        },
        "alerts"
      );
    }),

  /** Top triggered rules */
  alertsAggByRule: protectedProcedure
    .input(timeRangeSchema.extend({ topN: z.number().int().min(1).max(50).default(15) }))
    .query(async ({ input }) => {
      return safeSearch(
        INDEX_PATTERNS.ALERTS,
        {
          query: boolQuery({ filter: [timeRangeFilter(input.from, input.to)] }),
          size: 0,
          aggs: {
            top_rules: {
              ...termsAgg("rule.id", input.topN),
              aggs: {
                rule_description: termsAgg("rule.description", 1),
                rule_level: { avg: { field: "rule.level" } },
              },
            },
          },
        },
        "alerts"
      );
    }),

  /** Alert count timeline (date_histogram) */
  alertsTimeline: protectedProcedure
    .input(timeRangeSchema.extend({ interval: z.string().default("1h") }))
    .query(async ({ input }) => {
      return safeSearch(
        INDEX_PATTERNS.ALERTS,
        {
          query: boolQuery({ filter: [timeRangeFilter(input.from, input.to)] }),
          size: 0,
          aggs: {
            timeline: dateHistogramAgg("timestamp", input.interval),
          },
        },
        "alerts"
      );
    }),

  /** Geographic distribution by GeoLocation.country_name */
  alertsGeoAgg: protectedProcedure
    .input(timeRangeSchema.extend({ topN: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      return safeSearch(
        INDEX_PATTERNS.ALERTS,
        {
          query: boolQuery({
            filter: [
              timeRangeFilter(input.from, input.to),
              { exists: { field: "GeoLocation.country_name" } },
            ],
          }),
          size: 0,
          aggs: {
            countries: {
              ...termsAgg("GeoLocation.country_name", input.topN),
              aggs: {
                cities: termsAgg("GeoLocation.city_name", 5),
                avg_level: { avg: { field: "rule.level" } },
              },
            },
          },
        },
        "alerts"
      );
    }),

  /** GeoIP-enriched geographic distribution — resolves source IPs to coordinates */
  alertsGeoEnriched: protectedProcedure
    .input(timeRangeSchema.extend({ topN: z.number().int().min(1).max(100).default(30) }))
    .query(async ({ input }) => {
      // First, get alerts with source IPs
      const result = await safeSearch(
        INDEX_PATTERNS.ALERTS,
        {
          query: boolQuery({
            filter: [
              timeRangeFilter(input.from, input.to),
            ],
          }),
          size: 0,
          aggs: {
            // Try GeoLocation first (Wazuh-enriched)
            geo_countries: {
              ...termsAgg("GeoLocation.country_name", input.topN),
              aggs: {
                avg_level: { avg: { field: "rule.level" } },
                avg_lat: { avg: { field: "GeoLocation.latitude" } },
                avg_lon: { avg: { field: "GeoLocation.longitude" } },
                cities: termsAgg("GeoLocation.city_name", 5),
                top_ips: termsAgg("data.srcip", 10),
              },
            },
            // Also aggregate by source IP for GeoIP fallback
            source_ips: {
              ...termsAgg("data.srcip", 200),
              aggs: {
                avg_level: { avg: { field: "rule.level" } },
              },
            },
          },
        },
        "alerts"
      );

      if (!result.data) return result;

      // Extract aggregation data
      const aggs = (result.data as unknown as Record<string, unknown>)?.aggregations as Record<string, unknown> | undefined;
      const geoCountries = aggs?.geo_countries as { buckets?: Array<{ key: string; doc_count: number; avg_level: { value: number }; avg_lat: { value: number | null }; avg_lon: { value: number | null }; cities: { buckets: Array<{ key: string; doc_count: number }> }; top_ips: { buckets: Array<{ key: string; doc_count: number }> } }> } | undefined;
      const sourceIps = aggs?.source_ips as { buckets?: Array<{ key: string; doc_count: number; avg_level: { value: number } }> } | undefined;

      // Build enriched results
      const enrichedCountries: Array<{
        country: string;
        count: number;
        avgLevel: number;
        lat: number;
        lng: number;
        cities: string[];
        topIps: string[];
        source: "wazuh-geo" | "geoip-lite";
      }> = [];

      // Use Wazuh GeoLocation data if available
      if (geoCountries?.buckets && geoCountries.buckets.length > 0) {
        for (const bucket of geoCountries.buckets) {
          enrichedCountries.push({
            country: bucket.key,
            count: bucket.doc_count,
            avgLevel: Math.round((bucket.avg_level?.value ?? 0) * 10) / 10,
            lat: bucket.avg_lat?.value ?? 0,
            lng: bucket.avg_lon?.value ?? 0,
            cities: bucket.cities?.buckets?.map(c => c.key) ?? [],
            topIps: bucket.top_ips?.buckets?.map(ip => ip.key) ?? [],
            source: "wazuh-geo",
          });
        }
      }

      // Enrich remaining source IPs via geoip-lite for IPs not covered by Wazuh GeoLocation
      const coveredIps = new Set(enrichedCountries.flatMap(c => c.topIps));
      const uncoveredIps = sourceIps?.buckets
        ?.filter(b => !coveredIps.has(b.key))
        ?.slice(0, 100) ?? [];

      if (uncoveredIps.length > 0) {
        const { batchLookupIPs, aggregateByCountry } = await import("../geoip/geoipService");
        const lookups = batchLookupIPs(uncoveredIps.map(b => b.key));
        const geoResults = Array.from(lookups.values()).filter(r => r.country !== null);
        const countryAggs = aggregateByCountry(geoResults);

        // Merge with existing or add new
        for (const ca of countryAggs) {
          const existing = enrichedCountries.find(e => e.country === ca.country);
          if (existing) {
            // Merge counts
            const matchingIps = uncoveredIps.filter(b => {
              const lookup = lookups.get(b.key);
              return lookup?.country === ca.country;
            });
            const additionalCount = matchingIps.reduce((sum, b) => sum + b.doc_count, 0);
            existing.count += additionalCount;
          } else {
            // Calculate count from matching IPs
            const matchingIps = uncoveredIps.filter(b => {
              const lookup = lookups.get(b.key);
              return lookup?.country === ca.country;
            });
            const totalCount = matchingIps.reduce((sum, b) => sum + b.doc_count, 0);
            const avgLevel = matchingIps.reduce((sum, b) => sum + (b.avg_level?.value ?? 0), 0) / (matchingIps.length || 1);
            enrichedCountries.push({
              country: ca.country,
              count: totalCount,
              avgLevel: Math.round(avgLevel * 10) / 10,
              lat: ca.lat,
              lng: ca.lng,
              cities: ca.cities,
              topIps: ca.ips.slice(0, 10),
              source: "geoip-lite",
            });
          }
        }
      }

      // Sort by count descending and limit
      enrichedCountries.sort((a, b) => b.count - a.count);

      return {
        configured: true,
        data: enrichedCountries.slice(0, input.topN),
      };
    }),

  /** Compliance framework alert aggregation (PCI DSS, HIPAA, NIST, GDPR) */
  alertsComplianceAgg: protectedProcedure
    .input(
      timeRangeSchema.extend({
        framework: z.enum(["pci_dss", "hipaa", "nist_800_53", "gdpr", "tsc"]),
      })
    )
    .query(async ({ input }) => {
      const frameworkField = `rule.${input.framework}`;
      return safeSearch(
        INDEX_PATTERNS.ALERTS,
        {
          query: boolQuery({
            filter: [
              timeRangeFilter(input.from, input.to),
              { exists: { field: frameworkField } },
            ],
          }),
          size: 0,
          aggs: {
            controls: {
              ...termsAgg(frameworkField, 50),
              aggs: {
                over_time: dateHistogramAgg("timestamp", "1d"),
                severity: termsAgg("rule.level", 16),
              },
            },
            timeline: {
              ...dateHistogramAgg("timestamp", "1d"),
              aggs: {
                controls: termsAgg(frameworkField, 10),
              },
            },
          },
        },
        "alerts"
      );
    }),

  // ═════════════════════════════════════════════════════════════════════════════
  // wazuh-states-vulnerabilities-* — Global vulnerability state
  // ═════════════════════════════════════════════════════════════════════════════

  /** Global vulnerability search across all agents */
  vulnSearch: protectedProcedure
    .input(
      z.object({
        ...timeRangeSchema.shape,
        ...paginationSchema.shape,
        query: z.string().optional(),
        severity: z.enum(["Critical", "High", "Medium", "Low"]).optional(),
        agentId: z.string().optional(),
        cve: z.string().optional(),
        packageName: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const filters: Array<Record<string, unknown>> = [];
      const must: Array<Record<string, unknown>> = [];

      if (input.severity) filters.push({ term: { "vulnerability.severity": input.severity } });
      if (input.agentId) filters.push({ term: { "agent.id": input.agentId } });
      if (input.cve) filters.push({ term: { "vulnerability.id": input.cve } });
      if (input.packageName) filters.push({ term: { "package.name": input.packageName } });

      if (input.query) {
        must.push({
          multi_match: {
            query: input.query,
            fields: ["vulnerability.id", "vulnerability.title", "package.name", "agent.name"],
            type: "best_fields",
          },
        });
      }

      return safeSearch(
        INDEX_PATTERNS.VULNERABILITIES,
        {
          query: boolQuery({ must, filter: filters }),
          size: input.size,
          from: input.offset,
          sort: [{ "vulnerability.score.base": { order: "desc" } }],
        },
        "vulnerabilities"
      );
    }),

  /** Vulnerability severity distribution */
  vulnAggBySeverity: protectedProcedure.query(async () => {
    return safeSearch(
      INDEX_PATTERNS.VULNERABILITIES,
      {
        query: { match_all: {} },
        size: 0,
        aggs: {
          severity: termsAgg("vulnerability.severity", 10),
          avg_cvss: { avg: { field: "vulnerability.score.base" } },
          score_ranges: {
            range: {
              field: "vulnerability.score.base",
              ranges: [
                { key: "Critical (9.0-10.0)", from: 9.0 },
                { key: "High (7.0-8.9)", from: 7.0, to: 9.0 },
                { key: "Medium (4.0-6.9)", from: 4.0, to: 7.0 },
                { key: "Low (0.1-3.9)", from: 0.1, to: 4.0 },
              ],
            },
          },
        },
      },
      "vulnerabilities"
    );
  }),

  /** Top vulnerable agents */
  vulnAggByAgent: protectedProcedure
    .input(z.object({ topN: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      return safeSearch(
        INDEX_PATTERNS.VULNERABILITIES,
        {
          query: { match_all: {} },
          size: 0,
          aggs: {
            top_agents: {
              ...termsAgg("agent.id", input.topN),
              aggs: {
                agent_name: termsAgg("agent.name", 1),
                severity: termsAgg("vulnerability.severity", 5),
                avg_cvss: { avg: { field: "vulnerability.score.base" } },
              },
            },
          },
        },
        "vulnerabilities"
      );
    }),

  /** Most exploited packages */
  vulnAggByPackage: protectedProcedure
    .input(z.object({ topN: z.number().int().min(1).max(50).default(15) }))
    .query(async ({ input }) => {
      return safeSearch(
        INDEX_PATTERNS.VULNERABILITIES,
        {
          query: { match_all: {} },
          size: 0,
          aggs: {
            top_packages: {
              ...termsAgg("package.name", input.topN),
              aggs: {
                severity: termsAgg("vulnerability.severity", 5),
                versions: termsAgg("package.version", 5),
                avg_cvss: { avg: { field: "vulnerability.score.base" } },
              },
            },
          },
        },
        "vulnerabilities"
      );
    }),

  /** Top CVEs across fleet */
  vulnAggByCVE: protectedProcedure
    .input(z.object({ topN: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      return safeSearch(
        INDEX_PATTERNS.VULNERABILITIES,
        {
          query: { match_all: {} },
          size: 0,
          aggs: {
            top_cves: {
              ...termsAgg("vulnerability.id", input.topN),
              aggs: {
                severity: termsAgg("vulnerability.severity", 1),
                affected_agents: { cardinality: { field: "agent.id" } },
                packages: termsAgg("package.name", 5),
                avg_cvss: { avg: { field: "vulnerability.score.base" } },
              },
            },
          },
        },
        "vulnerabilities"
      );
    }),

  // ═════════════════════════════════════════════════════════════════════════════
  // wazuh-monitoring-* — Agent connection telemetry over time
  // ═════════════════════════════════════════════════════════════════════════════

  /** Agent connection state history */
  monitoringAgentHistory: protectedProcedure
    .input(
      timeRangeSchema.extend({
        agentId: z.string().optional(),
        interval: z.string().default("1h"),
      })
    )
    .query(async ({ input }) => {
      const filters: Array<Record<string, unknown>> = [
        timeRangeFilter(input.from, input.to),
      ];
      if (input.agentId) filters.push({ term: { "id": input.agentId } });

      return safeSearch(
        INDEX_PATTERNS.MONITORING,
        {
          query: boolQuery({ filter: filters }),
          size: 0,
          aggs: {
            status_over_time: {
              ...dateHistogramAgg("timestamp", input.interval),
              aggs: {
                status: termsAgg("status", 5),
              },
            },
            agents: {
              ...termsAgg("id", 20),
              aggs: {
                name: termsAgg("name", 1),
                latest_status: {
                  top_hits: {
                    size: 1,
                    sort: [{ timestamp: { order: "desc" } }],
                    _source: ["status", "timestamp", "ip"],
                  },
                },
              },
            },
          },
        },
        "monitoring"
      );
    }),

  // ═════════════════════════════════════════════════════════════════════════════
  // wazuh-statistics-* — Server performance metrics
  // ═════════════════════════════════════════════════════════════════════════════

  /** Manager performance metrics over time */
  statisticsPerformance: protectedProcedure
    .input(
      timeRangeSchema.extend({
        interval: z.string().default("1h"),
      })
    )
    .query(async ({ input }) => {
      return safeSearch(
        INDEX_PATTERNS.STATISTICS,
        {
          query: boolQuery({ filter: [timeRangeFilter(input.from, input.to)] }),
          size: 0,
          aggs: {
            metrics_over_time: {
              ...dateHistogramAgg("timestamp", input.interval),
              aggs: {
                avg_events: { avg: { field: "analysisd.events_received" } },
                avg_decoded: { avg: { field: "analysisd.events_decoded_breakdown.syscheck" } },
                avg_dropped: { avg: { field: "analysisd.events_dropped" } },
                avg_written: { avg: { field: "analysisd.alerts_written" } },
              },
            },
          },
        },
        "statistics"
      );
    }),

  // ═════════════════════════════════════════════════════════════════════════════
  // wazuh-archives-* — Raw events for forensic investigation
  // ═════════════════════════════════════════════════════════════════════════════

  /** Raw event search for forensic investigation */
  archivesSearch: protectedProcedure
    .input(
      z.object({
        ...timeRangeSchema.shape,
        ...paginationSchema.shape,
        query: z.string().optional(),
        agentId: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const timeFrom = input.from as string;
      const timeTo = input.to as string;
      const filters: Array<Record<string, unknown>> = [
        timeRangeFilter(timeFrom, timeTo),
      ];
      const must: Array<Record<string, unknown>> = [];

      if (input.agentId) filters.push({ term: { "agent.id": input.agentId } });
      if (input.query) {
        must.push({
          query_string: {
            query: input.query,
            default_field: "full_log",
          },
        });
      }

      return safeSearch(
        INDEX_PATTERNS.ARCHIVES,
        {
          query: boolQuery({ must, filter: filters }),
          size: input.size,
          from: input.offset,
          sort: [{ timestamp: { order: "desc" } }],
        },
        "archives"
      );
    }),
});
