/**
 * ReadinessBanner — Displays a truthful banner when agentic workflows
 * are degraded or blocked. Shows dependency-level detail so the analyst
 * knows exactly what's wrong and what still works.
 */
import { AlertTriangle, XCircle, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useAgenticReadiness } from "../../hooks/useAgenticReadiness";

export function ReadinessBanner() {
  const { data, isLoading, overall } = useAgenticReadiness();
  const [expanded, setExpanded] = useState(false);

  if (isLoading || !data || overall === "ready") return null;

  const isBlocked = overall === "blocked";
  const borderColor = isBlocked ? "border-red-500/40" : "border-amber-500/40";
  const bgColor = isBlocked ? "bg-red-500/10" : "bg-amber-500/10";
  const textColor = isBlocked ? "text-red-300" : "text-amber-300";
  const Icon = isBlocked ? XCircle : AlertTriangle;

  const deps = data.dependencies;
  const depEntries = Object.entries(deps) as Array<[string, typeof deps.database]>;
  const problemDeps = depEntries.filter(([, d]) => d.state !== "ready");

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} px-4 py-3 mb-4`} role="alert" aria-live="assertive">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${textColor}`} />
          <span className={`text-sm font-medium ${textColor}`}>
            Agentic Workflows {isBlocked ? "Blocked" : "Degraded"}
          </span>
          <span className="text-xs text-muted-foreground ml-2">
            {problemDeps.length} dependency issue{problemDeps.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          {expanded ? "Hide" : "Details"}
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>
      <span className="sr-only">
        {isBlocked ? "Critical: Agentic workflows are blocked." : "Warning: Agentic workflows are degraded."}
        {" "}{problemDeps.length} dependency issue{problemDeps.length !== 1 ? "s" : ""} detected.
      </span>

      {expanded && (
        <div className="mt-3 space-y-2 text-xs">
          {/* Workflow status */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded border border-white/5 bg-white/5 p-2">
              <div className="flex items-center gap-1.5 mb-1">
                <WorkflowIcon state={data.workflows.structuredPipeline.state} />
                <span className="font-medium text-foreground">Structured Pipeline</span>
              </div>
              <span className="text-muted-foreground">
                {data.workflows.structuredPipeline.reason ?? "Ready"}
              </span>
            </div>
            <div className="rounded border border-white/5 bg-white/5 p-2">
              <div className="flex items-center gap-1.5 mb-1">
                <WorkflowIcon state={data.workflows.adHocAnalyst.state} />
                <span className="font-medium text-foreground">Ad-hoc Analyst</span>
              </div>
              <span className="text-muted-foreground">
                {data.workflows.adHocAnalyst.reason ?? "Ready"}
              </span>
            </div>
            <div className="rounded border border-white/5 bg-white/5 p-2">
              <div className="flex items-center gap-1.5 mb-1">
                <WorkflowIcon state={data.workflows.ticketing?.state ?? "ready"} />
                <span className="font-medium text-foreground">Ticketing</span>
              </div>
              <span className="text-muted-foreground">
                {data.workflows.ticketing?.reason ?? "Ready"}
              </span>
            </div>
          </div>

          {/* Dependency detail */}
          <div className="space-y-1">
            {depEntries.map(([name, dep]) => (
              <div key={name} className="flex items-center gap-2 text-muted-foreground">
                <DepIcon state={dep.state} />
                <span className="font-mono">{name}</span>
                <span className="text-muted-foreground/60">—</span>
                <span>{dep.reason ?? dep.state}</span>
                {dep.fallbackActive && (
                  <span className="text-amber-400 text-[10px] border border-amber-400/30 rounded px-1">
                    fallback
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkflowIcon({ state }: { state: string }) {
  if (state === "ready") return <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />;
  if (state === "degraded") return <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />;
  return <XCircle className="h-3.5 w-3.5 text-red-400" />;
}

function DepIcon({ state }: { state: string }) {
  if (state === "ready") return <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" />;
  if (state === "degraded") return <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />;
  return <span className="h-2 w-2 rounded-full bg-red-400 inline-block" />;
}
