/**
 * Connection Settings Router — admin-only tRPC procedures.
 *
 * Provides:
 * - getSettings: Read current effective settings (DB override → env → default)
 * - updateSettings: Save new connection settings (encrypted passwords)
 * - testConnection: Validate credentials before saving
 * - resetSettings: Revert to environment variables
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import {
  getEffectiveSettings,
  saveSettings,
  resetSettings,
  invalidateCache,
} from "./connectionSettingsService";
import axios from "axios";
import { createTlsAgent } from "../_core/tlsAgent";
import { testLLMConnection } from "../llm/llmService";
import { testSplunkConnection } from "../splunk/splunkService";
import { validateHost } from "./hostValidation";

const categorySchema = z.enum(["wazuh_manager", "wazuh_indexer", "llm", "splunk"]);

export const connectionSettingsRouter = router({
  /**
   * Get effective settings for a category.
   * Passwords are masked in the response (only shows if set or not).
   */
  getSettings: adminProcedure
    .input(z.object({ category: categorySchema }))
    .query(async ({ input }) => {
      const { values, sources } = await getEffectiveSettings(input.category);

      // Mask password values — never send them to the client
      const maskedValues: Record<string, string> = {};
      const hasPassword: Record<string, boolean> = {};

      for (const [key, value] of Object.entries(values)) {
        if (key === "pass" || key === "password" || key === "api_key" || key === "hec_token") {
          maskedValues[key] = "";
          hasPassword[key] = !!value;
        } else {
          maskedValues[key] = value;
        }
      }

      return { values: maskedValues, sources, hasPassword };
    }),

  /**
   * Update settings for a category.
   * Empty string values are skipped (not saved).
   * Password fields are encrypted before storage.
   */
  updateSettings: adminProcedure
    .input(
      z.object({
        category: categorySchema,
        settings: z.record(z.string(), z.string()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Filter out empty values (except explicit empty to clear)
      const filtered: Record<string, string> = {};
      for (const [key, value] of Object.entries(input.settings)) {
        if (value !== undefined) {
          filtered[key] = value;
        }
      }

      if (Object.keys(filtered).length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No settings provided",
        });
      }

      // Audit #7: Validate host fields before persisting to prevent SSRF via config
      const hostField = filtered.host || filtered.WAZUH_HOST || filtered.WAZUH_INDEXER_HOST;
      if (hostField) {
        const hostCheck = await validateHost(hostField);
        if (!hostCheck.allowed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Host validation failed: ${hostCheck.reason}`,
          });
        }
      }

      await saveSettings(input.category, filtered, ctx.user.id);

      return { success: true, message: `${input.category} settings updated` };
    }),

  /**
   * Test a connection with provided credentials (without saving).
   * Validates that the host is reachable and credentials are valid.
   */
  testConnection: adminProcedure
    .input(
      z.object({
        category: categorySchema,
        settings: z.record(z.string(), z.string()),
      })
    )
    .mutation(async ({ input }) => {
      const { category, settings } = input;

      // Merge form values with effective settings (DB → env → defaults)
      // so that empty fields fall back to stored/env values.
      // Passwords are never sent to the client, so we always need this merge.
      const effective = await getEffectiveSettings(category);
      const merged: Record<string, string> = { ...effective.values };
      for (const [key, value] of Object.entries(settings)) {
        if (value) merged[key] = value;
      }

      // LLM category has its own test logic (no user/pass required)
      if (category === "llm") {
        return testLLMConnection(merged);
      }

      // Splunk HEC has its own test logic
      if (category === "splunk") {
        const splunkResult = await testSplunkConnection();
        return {
          success: splunkResult.success,
          message: splunkResult.message,
          latencyMs: splunkResult.latencyMs ?? 0,
        };
      }

      const host = merged.host;
      const port = merged.port;
      const user = merged.user;
      const pass = merged.pass;

      if (!host || !user || !pass) {
        return {
          success: false,
          message: "Host, username, and password are required",
          latencyMs: 0,
        };
      }

      // SSRF defense: validate host against RFC 1918 allowlist
      const hostCheck = await validateHost(host);
      if (!hostCheck.allowed) {
        return {
          success: false,
          message: `Host validation failed: ${hostCheck.reason}`,
          latencyMs: 0,
        };
      }

      // S-1: Use pinnedIP from validation to prevent DNS rebinding.
      // The hostname was resolved once during validation; connect to that exact IP.
      const connectHost = hostCheck.pinnedIP || host;

      const startTime = Date.now();

      try {
        if (category === "wazuh_manager") {
          // Test Wazuh Manager API: POST /security/user/authenticate
          const baseURL = `https://${connectHost}:${port || "55000"}`;
          const instance = axios.create({
            baseURL,
            timeout: 10_000,
            httpsAgent: createTlsAgent(),
          });

          // CRITICAL: Wazuh /security/user/authenticate requires NO request body.
          // Credentials are passed via Basic Auth header only.
          const response = await instance.post(
            "/security/user/authenticate",
            undefined, // No body — Wazuh auth accepts credentials in the header only
            { auth: { username: user, password: pass } }
          );

          const token = response.data?.data?.token;
          const latencyMs = Date.now() - startTime;

          if (token) {
            return {
              success: true,
              message: `Connected to Wazuh Manager at ${host}:${port || "55000"}`,
              latencyMs,
            };
          } else {
            return {
              success: false,
              message: "Authentication succeeded but no token returned",
              latencyMs,
            };
          }
        } else if (category === "wazuh_indexer") {
          // Test Wazuh Indexer: GET /_cluster/health
          const protocol = merged.protocol || "https";
          const baseURL = `${protocol}://${connectHost}:${port || "9200"}`;
          const instance = axios.create({
            baseURL,
            timeout: 10_000,
            httpsAgent: createTlsAgent(),
            auth: { username: user, password: pass },
          });

          const response = await instance.get("/_cluster/health");
          const latencyMs = Date.now() - startTime;
          const clusterName = response.data?.cluster_name ?? "unknown";
          const status = response.data?.status ?? "unknown";

          return {
            success: true,
            message: `Connected to Indexer "${clusterName}" (status: ${status})`,
            latencyMs,
          };
        }

        return { success: false, message: "Unknown category", latencyMs: 0 };
      } catch (err: unknown) {
        const latencyMs = Date.now() - startTime;
        const message =
          axios.isAxiosError(err)
            ? err.code === "ECONNREFUSED"
              ? `Connection refused: ${host}:${port || (category === "wazuh_manager" ? "55000" : "9200")}`
              : err.code === "ECONNABORTED" || err.code === "ETIMEDOUT"
                ? `Connection timed out after ${latencyMs}ms`
                : err.response?.status === 401
                  ? "Authentication failed: invalid username or password"
                  : `Connection error: ${err.message}`
            : `Unexpected error: ${(err as Error).message}`;

        return { success: false, message, latencyMs };
      }
    }),

  /**
   * Reset all DB overrides for a category (revert to env vars).
   */
  resetSettings: adminProcedure
    .input(z.object({ category: categorySchema }))
    .mutation(async ({ input }) => {
      await resetSettings(input.category);
      return {
        success: true,
        message: `${input.category} settings reset to environment variables`,
      };
    }),
});
