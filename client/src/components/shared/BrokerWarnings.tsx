/**
 * BrokerWarnings — panel-local, inline, dismissible broker coercion warnings.
 *
 * Displays `_brokerWarnings` from broker-wired Wazuh responses as a compact
 * amber alert strip inside the panel that triggered the request. Not global,
 * not a toast — per-request, per-panel, human-readable.
 *
 * Design: Amethyst Nexus amber accent, glass-morphism, dismissible.
 */
import { useState } from "react";
import { AlertTriangle, X, ChevronDown, ChevronUp } from "lucide-react";

interface BrokerWarningsProps {
  /** The raw Wazuh response object — may or may not contain _brokerWarnings */
  data: unknown;
  /** Optional label for the panel context (e.g., "Agent List", "Manager Logs") */
  context?: string;
}

/**
 * Extract _brokerWarnings from a Wazuh response if present.
 * Returns null if no warnings exist.
 */
function extractWarnings(data: unknown): string[] | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj._brokerWarnings) || obj._brokerWarnings.length === 0) return null;
  return obj._brokerWarnings as string[];
}

export function BrokerWarnings({ data, context }: BrokerWarningsProps) {
  const warnings = extractWarnings(data);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!warnings || dismissed) return null;

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 backdrop-blur-sm px-3 py-2 mb-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-xs text-amber-300 font-medium truncate">
            {context ? `${context}: ` : ""}
            {warnings.length} parameter coercion warning{warnings.length !== 1 ? "s" : ""}
          </span>
          {warnings.length > 1 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-amber-400/70 hover:text-amber-300 transition-colors"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-400/50 hover:text-amber-300 transition-colors shrink-0"
          aria-label="Dismiss warnings"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Show first warning always, rest when expanded */}
      <div className="mt-1.5 space-y-1">
        <p className="text-[11px] text-amber-200/70 font-mono leading-relaxed">
          {warnings[0]}
        </p>
        {expanded && warnings.slice(1).map((w, i) => (
          <p key={i} className="text-[11px] text-amber-200/70 font-mono leading-relaxed">
            {w}
          </p>
        ))}
      </div>
    </div>
  );
}
