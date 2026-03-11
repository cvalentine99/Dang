/**
 * Readiness Router — exposes the agentic readiness contract via tRPC.
 *
 * Single endpoint: readiness.check
 * Returns the full AgenticReadiness object with dependency and workflow status.
 */

import { protectedProcedure, router } from "../_core/trpc";
import { checkAgenticReadiness } from "./readinessService";

export const readinessRouter = router({
  check: protectedProcedure.query(async () => {
    return checkAgenticReadiness();
  }),
});
