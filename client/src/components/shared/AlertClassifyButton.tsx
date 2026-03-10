/**
 * AlertClassifyButton — AI-powered alert classification inline component.
 *
 * Renders a small "AI Classify" button that, when clicked, sends the alert
 * to enhancedLLM.classifyAlert and displays the structured result in a
 * glass-panel popover.
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Brain, Loader2, X, Shield, Target, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronRight, Copy, Check,
} from "lucide-react";

interface AlertClassifyButtonProps {
  alertData: Record<string, unknown>;
  agentContext?: {
    agentId?: string;
    agentName?: string;
    os?: string;
    groups?: string[];
  };
  compact?: boolean;
}

interface Classification {
  severity: string;
  classification: string;
  iocs: string[];
  recommendedActions: string[];
  mitreATechniques: string[];
  confidence: number;
  reasoning: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  low: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  info: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

export default function AlertClassifyButton({ alertData, agentContext, compact = false }: AlertClassifyButtonProps) {
  const [result, setResult] = useState<Classification | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const [copied, setCopied] = useState(false);

  const classifyMutation = trpc.enhancedLLM.classifyAlert.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setShowResult(true);
    },
  });

  const handleClassify = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (classifyMutation.isPending) return;
    classifyMutation.mutate({ alertData, agentContext });
  };

  const handleCopyResult = () => {
    if (!result) return;
    const text = [
      `Classification: ${result.classification}`,
      `Severity: ${result.severity}`,
      `Confidence: ${(result.confidence * 100).toFixed(0)}%`,
      `IOCs: ${result.iocs.join(", ") || "None"}`,
      `MITRE: ${result.mitreATechniques.join(", ") || "None"}`,
      `Actions: ${result.recommendedActions.join("; ") || "None"}`,
      `Reasoning: ${result.reasoning}`,
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={handleClassify}
        disabled={classifyMutation.isPending}
        className={`flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50 ${
          compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
        }`}
        title="AI Classify Alert"
      >
        {classifyMutation.isPending ? (
          <Loader2 className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} animate-spin`} />
        ) : (
          <Brain className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"}`} />
        )}
        {!compact && <span>AI Classify</span>}
      </button>

      {/* Result Popover */}
      {showResult && result && (
        <div className="absolute bottom-full right-0 mb-2 w-80 glass-panel rounded-xl border border-white/10 p-4 z-50 shadow-2xl" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-medium text-foreground">AI Classification</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleCopyResult} className="p-1 rounded hover:bg-white/5 text-muted-foreground" title="Copy">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => setShowResult(false)} className="p-1 rounded hover:bg-white/5 text-muted-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Severity + Classification */}
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${SEVERITY_COLORS[result.severity] ?? SEVERITY_COLORS.info}`}>
              {result.severity}
            </span>
            <span className="text-xs font-medium text-foreground flex-1 truncate">{result.classification}</span>
          </div>

          {/* Confidence Gauge */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground">Confidence</span>
              <span className="text-[10px] font-mono text-foreground">{(result.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  result.confidence >= 0.7 ? "bg-emerald-400" :
                  result.confidence >= 0.5 ? "bg-amber-400" : "bg-red-400"
                }`}
                style={{ width: `${result.confidence * 100}%` }}
              />
            </div>
          </div>

          {/* IOCs */}
          {result.iocs.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                <Shield className="w-3 h-3" /> IOCs ({result.iocs.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {result.iocs.map((ioc, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-[10px] font-mono text-red-400">
                    {ioc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* MITRE Techniques */}
          {result.mitreATechniques.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                <Target className="w-3 h-3" /> MITRE ATT&CK
              </p>
              <div className="flex flex-wrap gap-1">
                {result.mitreATechniques.map((t, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[10px] font-mono text-purple-400">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recommended Actions */}
          {result.recommendedActions.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Recommended Actions
              </p>
              <ul className="space-y-1">
                {result.recommendedActions.map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[10px] text-foreground">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reasoning (collapsible) */}
          <button
            onClick={() => setShowReasoning(!showReasoning)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {showReasoning ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Reasoning
          </button>
          {showReasoning && (
            <p className="text-[10px] text-muted-foreground mt-1 pl-4 border-l border-white/10">
              {result.reasoning}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
