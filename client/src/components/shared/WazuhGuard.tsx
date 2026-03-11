import { trpc } from "@/lib/trpc";
import { Wifi, WifiOff } from "lucide-react";
import { ReactNode } from "react";

interface WazuhGuardProps {
  children: ReactNode;
}

/**
 * WazuhGuard — shows an inline connection banner with structured error detail.
 *
 * Connection truth:
 *   - configured: Wazuh host/user/pass are set (env or DB override)
 *   - connected: configured AND the /manager/info probe returned data
 *   - errorDetail: when configured but NOT connected, the structured reason
 *     (e.g., "Connection refused at https://192.168.50.158:55000 — is Wazuh Manager running?")
 *
 * Always renders children — pages handle their own empty states.
 */
export function WazuhGuard({ children }: WazuhGuardProps) {
  const { data, isLoading } = trpc.wazuh.status.useQuery(undefined, {
    retry: 1,
    staleTime: 60_000,
  });

  // Structured connection truth — no muddy logic
  const isConfigured = data?.configured === true;
  const hasData = data?.data != null;
  const isConnected = isConfigured && hasData;
  const errorDetail = (data as Record<string, unknown>)?.error as string | undefined;

  return (
    <div className="space-y-4">
      {/* Connection status banner */}
      {!isLoading && (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-xs font-medium ${
          isConnected
            ? "bg-threat-low/5 border-threat-low/20 text-threat-low"
            : "bg-threat-high/5 border-threat-high/20 text-threat-high"
        }`}>
          {isConnected ? (
            <>
              <Wifi className="h-3.5 w-3.5" />
              <span>Wazuh API Connected</span>
              <span className="text-muted-foreground ml-1">— Live data active</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5" />
              <span>Wazuh API Not Connected</span>
              <span className="text-muted-foreground ml-1">
                {!isConfigured
                  ? "— Set WAZUH_HOST, WAZUH_USER, WAZUH_PASS in Secrets"
                  : `— ${errorDetail ?? "Connection failed (no detail available)"}`}
              </span>
            </>
          )}
        </div>
      )}

      {/* Always render children */}
      {children}
    </div>
  );
}

/**
 * Hook to check Wazuh connection status without blocking.
 * Returns structured errorDetail instead of generic messages.
 */
export function useWazuhStatus() {
  const { data, isLoading } = trpc.wazuh.status.useQuery(undefined, {
    retry: 1,
    staleTime: 60_000,
  });
  const isConfigured = data?.configured === true;
  const hasData = data?.data != null;
  const errorDetail = (data as Record<string, unknown>)?.error as string | undefined;
  return {
    isLoading,
    isConfigured,
    isConnected: isConfigured && hasData,
    errorDetail,
  };
}
