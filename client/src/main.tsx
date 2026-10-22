import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import { toast } from "sonner";
import App from "./App";
import "./index.css";

// H-C9: sane defaults. Chrome polls (alertQueue.count/recentAlerts, llm.healthCheck)
// set their own refetchInterval/staleTime explicitly.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

/**
 * On auth failure, redirect to local login page.
 * No Manus OAuth. No external auth providers.
 */
const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  // Key on the structured tRPC code; the legacy message match is a fallback
  // for any procedure still throwing a bare Error(UNAUTHED_ERR_MSG).
  const isUnauthorized =
    error.data?.code === "UNAUTHORIZED" || error.message === UNAUTHED_ERR_MSG;
  const path = window.location.pathname;
  if (isUnauthorized && !path.startsWith("/login") && !path.startsWith("/register")) {
    window.location.href = "/login";
  }
};

/** M3: surface authorization failures instead of swallowing them. */
const toastIfForbidden = (error: unknown) => {
  if (error instanceof TRPCClientError && error.data?.code === "FORBIDDEN") {
    // Stable id so a page with several admin-only queries shows one toast, not N.
    toast.error("You need admin access for that", { id: "trpc-forbidden" });
  }
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    toastIfForbidden(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    // Mutations with their own onError surface the server's message
    // (e.g. alertQueue.remove FORBIDDEN for non-owners); avoid a second toast.
    if (!event.mutation.options.onError) toastIfForbidden(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
