/**
 * AlienVault OTX tRPC Router — read-only threat intelligence queries.
 *
 * Endpoints:
 * - status: Check OTX connectivity and user info
 * - subscribedPulses: Paginated list of subscribed pulses
 * - pulseDetail: Single pulse with metadata
 * - pulseIndicators: IOCs within a pulse
 * - searchPulses: Full-text pulse search
 * - indicatorLookup: IOC reputation lookup (IPv4, IPv6, domain, hostname, file hash, URL, CVE)
 * - activity: Recent pulse activity feed
 * - cacheStats: Cache statistics (RAM + DB)
 * - forceRefreshAll: Flush RAM cache and trigger fresh fetches
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  isOtxConfigured,
  otxGet,
  getCacheStats,
  getDbCacheStats,
  flushRamCache,
  purgeExpiredDbCache,
} from "./otxClient";

export const otxRouter = router({
  // ── Status / connectivity check ────────────────────────────────────────────
  status: protectedProcedure.query(async () => {
    if (!isOtxConfigured()) {
      return { configured: false, user: null };
    }
    try {
      const user = await otxGet("/api/v1/users/me", {}, "default", 600);
      return { configured: true, user };
    } catch (err) {
      return { configured: true, user: null, error: (err as Error).message };
    }
  }),

  // ── Subscribed pulses (paginated) ──────────────────────────────────────────
  subscribedPulses: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(10),
        modified_since: z.string().optional(),
        forceRefresh: z.boolean().optional().default(false),
      })
    )
    .query(async ({ input }) => {
      if (!isOtxConfigured()) {
        return { configured: false, data: null };
      }
      const data = await otxGet(
        "/api/v1/pulses/subscribed",
        {
          page: input.page,
          limit: input.limit,
          modified_since: input.modified_since,
        },
        "pulses",
        300,
        input.forceRefresh
      );
      return { configured: true, data };
    }),

  // ── Pulse detail ───────────────────────────────────────────────────────────
  pulseDetail: protectedProcedure
    .input(
      z.object({
        pulseId: z.string().min(1),
        forceRefresh: z.boolean().optional().default(false),
      })
    )
    .query(async ({ input }) => {
      if (!isOtxConfigured()) {
        return { configured: false, data: null };
      }
      const data = await otxGet(
        `/api/v1/pulses/${input.pulseId}`,
        {},
        "pulses",
        300,
        input.forceRefresh
      );
      return { configured: true, data };
    }),

  // ── Pulse indicators (IOCs in a pulse) ─────────────────────────────────────
  pulseIndicators: protectedProcedure
    .input(
      z.object({
        pulseId: z.string().min(1),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(500).default(50),
        forceRefresh: z.boolean().optional().default(false),
      })
    )
    .query(async ({ input }) => {
      if (!isOtxConfigured()) {
        return { configured: false, data: null };
      }
      const data = await otxGet(
        `/api/v1/pulses/${input.pulseId}/indicators`,
        { page: input.page, limit: input.limit },
        "pulses",
        300,
        input.forceRefresh
      );
      return { configured: true, data };
    }),

  // ── Search pulses ──────────────────────────────────────────────────────────
  searchPulses: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(10),
        forceRefresh: z.boolean().optional().default(false),
      })
    )
    .query(async ({ input }) => {
      if (!isOtxConfigured()) {
        return { configured: false, data: null };
      }
      const data = await otxGet(
        "/api/v1/search/pulses",
        { q: input.query, page: input.page, limit: input.limit },
        "search",
        300,
        input.forceRefresh
      );
      return { configured: true, data };
    }),

  // ── IOC Indicator lookup ───────────────────────────────────────────────────
  indicatorLookup: protectedProcedure
    .input(
      z.object({
        type: z.enum(["IPv4", "IPv6", "domain", "hostname", "file", "url", "cve"]),
        value: z.string().min(1),
        section: z
          .enum(["general", "reputation", "geo", "malware", "url_list", "passive_dns", "http_scans", "analysis"])
          .default("general"),
        forceRefresh: z.boolean().optional().default(false),
      })
    )
    .query(async ({ input }) => {
      if (!isOtxConfigured()) {
        return { configured: false, data: null };
      }

      // Encode all indicator values for safe path construction.
      // Previously only URL type was encoded, leaving other types
      // vulnerable to path traversal via crafted indicator values.
      const encodedValue = encodeURIComponent(input.value);

      const data = await otxGet(
        `/api/v1/indicators/${input.type}/${encodedValue}/${input.section}`,
        {},
        "indicators",
        600, // Cache IOC lookups for 10 minutes in RAM
        input.forceRefresh
      );
      return { configured: true, data };
    }),

  // ── Recent activity feed ───────────────────────────────────────────────────
  activity: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(20),
        forceRefresh: z.boolean().optional().default(false),
      })
    )
    .query(async ({ input }) => {
      if (!isOtxConfigured()) {
        return { configured: false, data: null };
      }
      const data = await otxGet(
        "/api/v1/pulses/activity",
        { page: input.page, limit: input.limit },
        "pulses",
        300,
        input.forceRefresh
      );
      return { configured: true, data };
    }),

  // ── Cache statistics ──────────────────────────────────────────────────────
  cacheStats: protectedProcedure.query(async () => {
    const ram = getCacheStats();
    const db = await getDbCacheStats();
    return { ram, db };
  }),

  // ── Force refresh: flush RAM cache + purge expired DB entries ─────────────
  forceRefreshAll: protectedProcedure.mutation(async () => {
    flushRamCache();
    const purged = await purgeExpiredDbCache();
    return { flushedRam: true, purgedDbEntries: purged };
  }),
});
