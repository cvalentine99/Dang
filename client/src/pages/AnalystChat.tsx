import React, { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { SoundEngine } from "@/lib/soundEngine";
import { useSearch } from "wouter";
import {
  Send, Bot, User, ChevronDown, ChevronRight, FileJson, Lightbulb, Loader2,
  AlertTriangle, Database, Search, Sparkles, Copy, Check, Shield, ShieldAlert,
  ShieldOff, Terminal, Zap, Activity, Clock, CheckCircle2, XCircle, Eye,
  Volume2, VolumeX, RotateCcw,
} from "lucide-react";
import { Streamdown } from "streamdown";

// ── Types ───────────────────────────────────────────────────────────────────

interface AgentStep {
  agent: "orchestrator" | "graph_retriever" | "indexer_retriever" | "synthesizer" | "safety_validator" | "pipeline_retriever";
  phase: number;
  action: string;
  detail: string;
  status: "running" | "complete" | "error" | "blocked";
  timestamp: number;
  durationMs?: number;
  dataPoints?: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  sources?: Array<{
    type: "graph" | "indexer" | "stats";
    label: string;
    data: unknown;
    relevance: string;
  }>;
  suggestedFollowUps?: string[];
  trustScore?: number;
  confidence?: number;
  safetyStatus?: "clean" | "filtered" | "blocked";
  agentSteps?: AgentStep[];
  provenance?: {
    queryHash: string;
    graphSourceCount: number;
    indexerSourceCount: number;
    totalDataPoints: number;
    blockedEndpoints: string[];
    filteredPatterns: string[];
    retrievalLatencyMs: number;
    synthesisLatencyMs: number;
  };
  timestamp: Date;
}

// ── Agent Config ────────────────────────────────────────────────────────────

const AGENT_CONFIG: Record<string, { label: string; icon: typeof Bot; color: string; bgClass: string }> = {
  orchestrator:       { label: "Orchestrator",      icon: Zap,      color: "#a78bfa", bgClass: "bg-purple-500/15 border-purple-500/30 text-purple-400" },
  graph_retriever:    { label: "Graph Retriever",   icon: Database,  color: "#818cf8", bgClass: "bg-indigo-500/15 border-indigo-500/30 text-indigo-400" },
  indexer_retriever:  { label: "Indexer Retriever",  icon: Search,    color: "#22d3ee", bgClass: "bg-cyan-500/15 border-cyan-500/30 text-cyan-400" },
  synthesizer:        { label: "Synthesizer",        icon: Sparkles,  color: "#fbbf24", bgClass: "bg-amber-500/15 border-amber-500/30 text-amber-400" },
  safety_validator:   { label: "Safety Validator",   icon: Shield,    color: "#34d399", bgClass: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" },
};

// ── Sound-Enabled Agent Activity Console ───────────────────────────────────

function AgentActivityConsole({
  steps,
  isLive,
  isReplay = false,
  onReplayRequest,
  canReplay = false,
}: {
  steps: AgentStep[];
  isLive: boolean;
  isReplay?: boolean;
  onReplayRequest?: () => void;
  canReplay?: boolean;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(true);
  const consoleRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(steps.length);
  const prevStepCountRef = useRef(0);

  useEffect(() => {
    if (consoleRef.current && (isLive || isReplay)) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [steps, isLive, isReplay, visibleCount]);

  // Play sounds when new steps appear during live analysis
  useEffect(() => {
    if (!isLive && !isReplay) return;
    const prevCount = prevStepCountRef.current;
    if (steps.length > prevCount) {
      const newStep = steps[steps.length - 1];
      SoundEngine.playForStep(newStep.agent, newStep.status);
    }
    prevStepCountRef.current = steps.length;
  }, [steps.length, isLive, isReplay]);

  // Staggered reveal for non-live, non-replay mode (when response arrives)
  useEffect(() => {
    if (!isLive && !isReplay && steps.length > 0) {
      setVisibleCount(0);
      let i = 0;
      const timer = setInterval(() => {
        i++;
        setVisibleCount(i);
        // Play step sound during staggered reveal
        if (steps[i - 1]) {
          SoundEngine.playForStep(steps[i - 1].agent, steps[i - 1].status);
        }
        if (i >= steps.length) {
          clearInterval(timer);
          // Play analysis done chime after all steps revealed
          setTimeout(() => SoundEngine.analysisDone(), 200);
        }
      }, 80);
      return () => clearInterval(timer);
    }
    setVisibleCount(steps.length);
  }, [isLive, isReplay, steps.length]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "running": return <Loader2 className="w-3 h-3 animate-spin text-blue-400" />;
      case "complete": return <CheckCircle2 className="w-3 h-3 text-green-400 animate-scale-in" />;
      case "error": return <XCircle className="w-3 h-3 text-red-400 animate-shake" />;
      case "blocked": return <ShieldOff className="w-3 h-3 text-red-400 animate-shake" />;
      default: return <Clock className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const displaySteps = steps.slice(0, visibleCount);

  return (
    <div className="mt-3 border border-white/5 rounded-lg overflow-hidden backdrop-blur-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        <Terminal className="w-3.5 h-3.5 text-green-400" />
        <span className="text-green-400 font-mono text-[11px]">Agent Activity</span>
        {isLive && (
          <span className="flex items-center gap-1 ml-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px] text-green-400 font-mono">ESTIMATING</span>
          </span>
        )}
        {isReplay && (
          <span className="flex items-center gap-1 ml-auto">
            <RotateCcw className="w-3 h-3 text-amber-400 animate-spin-slow" />
            <span className="text-[10px] text-amber-400 font-mono">REPLAY</span>
          </span>
        )}
        {!isLive && !isReplay && steps.length > 0 && (
          <span className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] text-muted-foreground font-mono">
              {steps.length} step{steps.length !== 1 ? "s" : ""}
            </span>
          </span>
        )}
      </button>
      {!isLive && !isReplay && canReplay && onReplayRequest && steps.length > 0 && (
        <div className="flex justify-end px-3 py-1 border-b border-white/5">
          <button
            onClick={() => onReplayRequest()}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-purple-500/20 bg-purple-500/5 text-purple-300 hover:bg-purple-500/15 hover:border-purple-500/30 transition-all text-[10px]"
            title="Replay agent activity"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>Replay</span>
          </button>
        </div>
      )}
      {expanded && (
        <div
          ref={consoleRef}
          className="bg-black/60 border-t border-white/5 px-3 py-2 max-h-64 overflow-y-auto font-mono text-[11px] space-y-0.5"
        >
          {steps.length === 0 && (isLive || isReplay) && (
            <div className="flex items-center gap-2 text-muted-foreground py-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="animate-typing-dots">{isReplay ? "Replaying pipeline" : "Initializing pipeline"}</span>
            </div>
          )}
          {displaySteps.map((step, i) => {
            const config = AGENT_CONFIG[step.agent] || AGENT_CONFIG.orchestrator;
            const AgentIcon = config.icon;
            const isLatest = i === displaySteps.length - 1;
            const isRunning = step.status === "running";
            return (
              <div
                key={i}
                className={`flex items-start gap-2 py-1 rounded-sm transition-all duration-500 animate-step-slide-in ${
                  isLatest && (isLive || isReplay) ? "bg-white/[0.03]" : ""
                } ${isRunning && (isLive || isReplay) ? "agent-step-glow" : ""}`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {/* Timestamp */}
                <span className="text-muted-foreground flex-shrink-0 w-16 text-right tabular-nums">
                  {step.durationMs != null ? (
                    <span className={step.durationMs > 2000 ? "text-yellow-400" : step.durationMs > 5000 ? "text-red-400" : ""}>
                      {step.durationMs}ms
                    </span>
                  ) : (
                    <span className="inline-flex gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  )}
                </span>

                {/* Status icon */}
                <span className="flex-shrink-0 mt-0.5">{statusIcon(step.status)}</span>

                {/* Agent badge */}
                <span
                  className={`flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] transition-all duration-300 ${
                    isRunning && (isLive || isReplay) ? "agent-badge-pulse" : ""
                  }`}
                  style={{
                    borderColor: `${config.color}${isRunning ? "80" : "40"}`,
                    backgroundColor: `${config.color}${isRunning ? "25" : "10"}`,
                    color: config.color,
                    boxShadow: isRunning && (isLive || isReplay) ? `0 0 12px ${config.color}30` : "none",
                  }}
                >
                  <AgentIcon className={`w-2.5 h-2.5 ${isRunning && (isLive || isReplay) ? "animate-spin-slow" : ""}`} />
                  {config.label}
                </span>

                {/* Action & detail */}
                <div className="flex-1 min-w-0">
                  <span className="text-foreground">{step.action}</span>
                  {step.detail && (
                    <span className="text-muted-foreground ml-1.5">— {step.detail}</span>
                  )}
                  {step.dataPoints != null && step.dataPoints > 0 && (
                    <span className="text-cyan-400 ml-1.5 animate-data-count">[{step.dataPoints} pts]</span>
                  )}
                </div>
              </div>
            );
          })}
          {(isLive || isReplay) && (
            <div className="flex items-center gap-1 text-green-400/60 pt-1">
              <span className="animate-cursor-blink">▌</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Trust & Safety Badge ────────────────────────────────────────────────────

function TrustBadge({ trustScore, confidence, safetyStatus, provenance }: {
  trustScore: number;
  confidence: number;
  safetyStatus: "clean" | "filtered" | "blocked";
  provenance?: ChatMessage["provenance"];
}): React.JSX.Element {
  const [showDetails, setShowDetails] = useState(false);

  const trustColor = trustScore >= 0.7 ? "text-green-400" : trustScore >= 0.4 ? "text-yellow-400" : "text-red-400";
  const trustBg = trustScore >= 0.7 ? "bg-green-500/10 border-green-500/20" : trustScore >= 0.4 ? "bg-yellow-500/10 border-yellow-500/20" : "bg-red-500/10 border-red-500/20";

  const safetyIcon = safetyStatus === "clean" ? Shield : safetyStatus === "filtered" ? ShieldAlert : ShieldOff;
  const SafetyIcon = safetyIcon;
  const safetyColor = safetyStatus === "clean" ? "text-green-400" : safetyStatus === "filtered" ? "text-yellow-400" : "text-red-400";

  return (
    <div className="mt-2">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-3 text-[11px]"
      >
        {/* Trust score */}
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border ${trustBg}`}>
          <Activity className={`w-3 h-3 ${trustColor}`} />
          <span className={`font-mono ${trustColor}`}>Trust {(trustScore * 100).toFixed(0)}%</span>
        </span>

        {/* Confidence */}
        <span className="flex items-center gap-1 text-muted-foreground">
          <Eye className="w-3 h-3" />
          <span className="font-mono">Conf {(confidence * 100).toFixed(0)}%</span>
        </span>

        {/* Safety */}
        <span className={`flex items-center gap-1 ${safetyColor}`}>
          <SafetyIcon className="w-3 h-3" />
          <span className="font-mono capitalize">{safetyStatus}</span>
        </span>

        <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${showDetails ? "rotate-180" : ""}`} />
      </button>

      {showDetails && provenance && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-black/30 border border-white/5 text-[10px] font-mono text-muted-foreground grid grid-cols-2 gap-x-6 gap-y-1">
          <span>Query Hash: <span className="text-foreground">{provenance.queryHash}</span></span>
          <span>Graph Sources: <span className="text-purple-400">{provenance.graphSourceCount}</span></span>
          <span>Indexer Sources: <span className="text-cyan-400">{provenance.indexerSourceCount}</span></span>
          <span>Data Points: <span className="text-foreground">{provenance.totalDataPoints}</span></span>
          <span>Retrieval: <span className="text-foreground">{provenance.retrievalLatencyMs}ms</span></span>
          <span>Synthesis: <span className="text-foreground">{provenance.synthesisLatencyMs}ms</span></span>
          {provenance.filteredPatterns.length > 0 && (
            <span className="col-span-2 text-yellow-400">
              Filtered: {provenance.filteredPatterns.join(", ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Source Panel Component ───────────────────────────────────────────────────

function SourcePanel({ sources }: { sources: ChatMessage["sources"] }): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<number>>(new Set());

  if (!sources || sources.length === 0) return null;

  const toggleSource = (idx: number) => {
    const next = new Set(expandedSources);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setExpandedSources(next);
  };

  const sourceIcon = (type: string) => {
    switch (type) {
      case "graph": return <Database className="w-3.5 h-3.5 text-purple-400" />;
      case "indexer": return <Search className="w-3.5 h-3.5 text-cyan-400" />;
      case "stats": return <Sparkles className="w-3.5 h-3.5 text-amber-400" />;
      default: return <FileJson className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  return (
    <div className="mt-3 border border-white/5 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-white/5 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <FileJson className="w-3.5 h-3.5" />
        <span>{sources.length} retrieval source{sources.length !== 1 ? "s" : ""}</span>
      </button>
      {expanded && (
        <div className="border-t border-white/5">
          {sources.map((src, idx) => (
            <div key={idx} className="border-b border-white/5 last:border-b-0">
              <button
                onClick={() => toggleSource(idx)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 transition-colors"
              >
                {expandedSources.has(idx) ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                {sourceIcon(src.type)}
                <span className="text-muted-foreground truncate flex-1 text-left">{src.label}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                  src.relevance === "primary" ? "bg-purple-500/20 text-purple-300" :
                  src.relevance === "error" ? "bg-red-500/20 text-red-300" :
                  "bg-white/5 text-muted-foreground"
                }`}>{src.relevance}</span>
              </button>
              {expandedSources.has(idx) && (
                <div className="px-3 pb-2">
                  <pre className="text-[11px] font-mono text-muted-foreground bg-black/30 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
                    {typeof src.data === "string" ? src.data : JSON.stringify(src.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Copy Button ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button onClick={handleCopy} className="p-1 rounded hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground" title="Copy">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── Message Component ───────────────────────────────────────────────────────

function ChatMessageBubble({
  message,
  replayingId,
  replaySteps,
  onReplayRequest,
}: {
  message: ChatMessage;
  replayingId: string | null;
  replaySteps: AgentStep[];
  onReplayRequest: (messageId: string, steps: AgentStep[]) => void;
}): React.JSX.Element {
  const isUser = message.role === "user";
  const isReplaying = replayingId === message.id;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
        isUser ? "bg-purple-500/20 border border-purple-500/30" : "bg-cyan-500/10 border border-cyan-500/20"
      }`}>
        {isUser ? <User className="w-4 h-4 text-purple-300" /> : <Bot className="w-4 h-4 text-cyan-300" />}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? "ml-auto" : ""}`}>
        <div className={`rounded-xl px-4 py-3 ${
          isUser
            ? "bg-purple-500/15 border border-purple-500/20"
            : "glass-panel"
        }`}>
          {isUser ? (
            <p className="text-sm text-foreground whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="text-sm text-foreground prose prose-invert prose-sm max-w-none prose-headings:text-purple-200 prose-strong:text-foreground prose-code:text-cyan-300 prose-code:bg-black/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/5">
              <Streamdown>{message.content}</Streamdown>
            </div>
          )}
        </div>

        {/* Trust & Safety Badge */}
        {!isUser && message.trustScore != null && (
          <TrustBadge
            trustScore={message.trustScore}
            confidence={message.confidence ?? 0}
            safetyStatus={message.safetyStatus ?? "clean"}
            provenance={message.provenance}
          />
        )}

        {/* Agent Activity Console — show replay steps if replaying, otherwise original */}
        {!isUser && message.agentSteps && message.agentSteps.length > 0 && (
          isReplaying ? (
            <AgentActivityConsole
              steps={replaySteps}
              isLive={false}
              isReplay={true}
            />
          ) : (
            <AgentActivityConsole
              steps={message.agentSteps}
              isLive={false}
              canReplay={true}
              onReplayRequest={() => onReplayRequest(message.id, message.agentSteps!)}
            />
          )
        )}

        {/* Reasoning badge */}
        {message.reasoning && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
            <Sparkles className="w-3 h-3" />
            <span>{message.reasoning}</span>
          </div>
        )}

        {/* Sources panel */}
        {!isUser && <SourcePanel sources={message.sources} />}

        {/* Copy button for assistant messages */}
        {!isUser && (
          <div className="mt-1 flex items-center gap-1">
            <CopyButton text={message.content} />
            <span className="text-[10px] text-muted-foreground">
              {message.timestamp.toLocaleTimeString()}
            </span>
          </div>
        )}

        {/* Follow-up suggestions */}
        {!isUser && message.suggestedFollowUps && message.suggestedFollowUps.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Lightbulb className="w-3 h-3" />
              <span>Suggested follow-ups</span>
            </div>
            {message.suggestedFollowUps.map((q, i) => (
              <SuggestionChip key={i} text={q} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Suggestion Chip ─────────────────────────────────────────────────────────

function SuggestionChip({ text }: { text: string }): React.JSX.Element {
  const handleClick = () => {
    window.dispatchEvent(new CustomEvent("analyst-suggestion", { detail: text }));
  };

  return (
    <button
      onClick={handleClick}
      className="text-left text-xs px-3 py-1.5 rounded-lg border border-purple-500/20 bg-purple-500/5 text-purple-200 hover:bg-purple-500/15 hover:border-purple-500/30 transition-all truncate"
    >
      {text}
    </button>
  );
}

// ── Agent Status Grid (shows all 5 agents with live state) ─────────────────

function AgentStatusGrid({ steps }: { steps: AgentStep[] }): React.JSX.Element {
  const agentOrder: Array<AgentStep["agent"]> = [
    "orchestrator", "graph_retriever", "indexer_retriever", "synthesizer", "safety_validator",
  ];

  const agentState = (agent: string): "idle" | "running" | "complete" | "error" => {
    const agentSteps = steps.filter(s => s.agent === agent);
    if (agentSteps.length === 0) return "idle";
    const last = agentSteps[agentSteps.length - 1];
    return last.status === "running" ? "running" : last.status === "error" ? "error" : "complete";
  };

  return (
    <div className="flex items-center gap-1.5 mb-3">
      {agentOrder.map((agent, i) => {
        const config = AGENT_CONFIG[agent];
        const AgentIcon = config.icon;
        const state = agentState(agent);
        const isActive = state === "running";
        const isDone = state === "complete";
        const isError = state === "error";

        return (
          <React.Fragment key={agent}>
            {i > 0 && (
              <div className={`w-6 h-px transition-all duration-700 ${
                isDone || isActive ? "bg-gradient-to-r from-white/20 to-white/10" : "bg-white/5"
              }`} />
            )}
            <div
              className={`relative flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-mono transition-all duration-500 ${
                isActive
                  ? "border-opacity-80 scale-105 agent-node-active"
                  : isDone
                  ? "border-opacity-40 opacity-80"
                  : isError
                  ? "border-red-500/40 bg-red-500/10"
                  : "border-white/5 bg-white/[0.02] opacity-40"
              }`}
              style={{
                borderColor: isActive ? `${config.color}80` : isDone ? `${config.color}40` : undefined,
                backgroundColor: isActive ? `${config.color}20` : isDone ? `${config.color}08` : undefined,
                color: isActive || isDone ? config.color : undefined,
                boxShadow: isActive ? `0 0 20px ${config.color}25, 0 0 40px ${config.color}10` : "none",
              }}
            >
              {isActive && (
                <span
                  className="absolute inset-0 rounded-md animate-ping-slow opacity-30"
                  style={{ border: `1px solid ${config.color}` }}
                />
              )}
              <AgentIcon className={`w-3 h-3 ${isActive ? "animate-spin-slow" : ""}`} />
              <span className="hidden sm:inline">{config.label}</span>
              {isDone && <CheckCircle2 className="w-2.5 h-2.5 text-green-400 animate-scale-in" />}
              {isError && <XCircle className="w-2.5 h-2.5 text-red-400" />}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Animated Progress Ring ──────────────────────────────────────────────────

function ProgressRing({ progress, size = 32 }: { progress: number; size?: number }): React.JSX.Element {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={2}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="url(#progressGradient)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-700 ease-out"
      />
      <defs>
        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="50%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Data Stream Effect ──────────────────────────────────────────────────────

function DataStreamEffect(): React.JSX.Element {
  const chars = "01";
  const [streams] = useState(() =>
    Array.from({ length: 12 }, () => ({
      delay: Math.random() * 3,
      duration: 1.5 + Math.random() * 2,
      left: Math.random() * 100,
      char: chars[Math.floor(Math.random() * chars.length)],
    }))
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.06]">
      {streams.map((s, i) => (
        <span
          key={i}
          className="absolute text-[10px] font-mono text-green-400 animate-data-rain"
          style={{
            left: `${s.left}%`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        >
          {s.char}
        </span>
      ))}
    </div>
  );
}

// ── Live Analysis Indicator ────────────────────────────────────────────────

function LiveAnalysisConsole({ steps }: { steps: AgentStep[] }): React.JSX.Element {
  const progress = Math.min(100, (steps.length / 8) * 100);
  const activeAgent = steps.length > 0 ? steps[steps.length - 1].agent : null;
  const activeConfig = activeAgent ? AGENT_CONFIG[activeAgent] : null;

  return (
    <div className="flex gap-3 animate-fade-in">
      <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-cyan-500/10 border border-cyan-500/20 relative">
        <Bot className="w-4 h-4 text-cyan-300" />
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse border border-black/50" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="glass-panel rounded-xl px-4 py-3 relative overflow-hidden">
          <DataStreamEffect />

          {/* Header with progress ring */}
          <div className="relative flex items-center gap-3 mb-3">
            <ProgressRing progress={progress} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground font-medium">Analyzing</span>
                <span className="animate-typing-dots text-sm text-muted-foreground">...</span>
              </div>
              {activeConfig && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded border animate-fade-in"
                    style={{
                      borderColor: `${activeConfig.color}50`,
                      backgroundColor: `${activeConfig.color}15`,
                      color: activeConfig.color,
                    }}
                  >
                    {activeConfig.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Phase {steps.length > 0 ? steps[steps.length - 1].phase : 1}/4
                  </span>
                </div>
              )}
            </div>
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
              </span>
              <span className="text-[10px] text-green-400 font-mono">ESTIMATED PROGRESS</span>
            </span>
          </div>

          {/* Agent Status Grid — estimated, not live telemetry */}
          <AgentStatusGrid steps={steps} />

          {/* Shimmer progress bar */}
          <div className="h-1 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 via-cyan-500 to-amber-500 animate-shimmer-slide transition-all duration-700 ease-out"
              style={{
                width: `${progress}%`,
                backgroundSize: "200% 100%",
              }}
            />
          </div>
        </div>

        {/* Live agent activity console */}
        <AgentActivityConsole steps={steps} isLive={true} />
      </div>
    </div>
  );
}

// ── Welcome Screen ──────────────────────────────────────────────────────────

function WelcomeScreen(): React.JSX.Element {
  const exampleQueries = [
    "Show me the most critical alerts from the last 24 hours",
    "Which endpoints have the most vulnerabilities?",
    "What MITRE ATT&CK techniques are most prevalent in our environment?",
    "Investigate agent 001 for suspicious activity",
    "What Wazuh API endpoints are available for agent monitoring?",
    "What is the overall security posture of our infrastructure?",
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
      <div className="w-16 h-16 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center mb-6">
        <Sparkles className="w-8 h-8 text-purple-400" />
      </div>
      <h2 className="text-2xl font-display font-bold text-foreground mb-2">Security Analyst</h2>
      <p className="text-muted-foreground text-sm text-center max-w-lg mb-2">
        Ad-hoc Security Analyst — Conversational Only
      </p>
      <p className="text-muted-foreground text-xs text-center max-w-lg mb-1 opacity-60">
        Trust scoring · Safety rails · Provenance tracking · Read-only by design
      </p>
      <p className="text-amber-400/70 text-[11px] text-center max-w-lg mb-8 font-medium">
        ⚠ Results are not persisted to the pipeline. For structured triage, use the Alert Queue.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-w-5xl w-full">
        {exampleQueries.map((q, i) => (
          <button
            key={i}
            onClick={() => window.dispatchEvent(new CustomEvent("analyst-suggestion", { detail: q }))}
            className="text-left text-xs px-4 py-3 rounded-xl border border-white/5 bg-white/[0.02] text-muted-foreground hover:bg-white/5 hover:border-purple-500/20 hover:text-foreground transition-all"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-4 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Database className="w-3 h-3 text-purple-400" />
          <span>Knowledge Graph</span>
        </div>
        <div className="w-1 h-1 rounded-full bg-white/20" />
        <div className="flex items-center gap-1.5">
          <Search className="w-3 h-3 text-cyan-400" />
          <span>Wazuh Indexer</span>
        </div>
        <div className="w-1 h-1 rounded-full bg-white/20" />
        <div className="flex items-center gap-1.5">
          <Shield className="w-3 h-3 text-green-400" />
          <span>Safety Rails</span>
        </div>
        <div className="w-1 h-1 rounded-full bg-white/20" />
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-amber-400" />
          <span>Trust Scoring</span>
        </div>
      </div>
    </div>
  );
}

// ── Sound Toggle Button ─────────────────────────────────────────────────────

function SoundToggle(): React.JSX.Element {
  const [muted, setMutedState] = useState(SoundEngine.isMuted());

  const handleToggle = () => {
    const newMuted = SoundEngine.toggleMute();
    setMutedState(newMuted);
    // Play a quick test sound when unmuting so user knows it works
    if (!newMuted) {
      SoundEngine.stepComplete();
    }
  };

  return (
    <button
      onClick={handleToggle}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
        muted
          ? "border-white/10 text-muted-foreground hover:bg-white/5"
          : "border-purple-500/20 bg-purple-500/5 text-purple-300 hover:bg-purple-500/15"
      }`}
      title={muted ? "Unmute sound effects" : "Mute sound effects"}
    >
      {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
      <span className="hidden sm:inline">{muted ? "Muted" : "Sound"}</span>
    </button>
  );
}

// ── Main Analyst Chat Page ──────────────────────────────────────────────────

export default function AnalystChat(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [liveSteps, setLiveSteps] = useState<AgentStep[]>([]);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [replaySteps, setReplaySteps] = useState<AgentStep[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const analystMutation = trpc.graph.analystQuery.useMutation();

  // Handle pre-loaded query from URL (e.g., from Alert Queue)
  const searchString = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const preloadedQuery = params.get("q");
    if (preloadedQuery && !isAnalyzing && messages.length === 0) {
      // Clear the URL param to prevent re-triggering
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      window.history.replaceState({}, "", url.pathname);
      // Auto-send the query
      handleSend(preloadedQuery);
    }
  }, [searchString]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAnalyzing, liveSteps, replaySteps]);

  // Listen for suggestion clicks
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail;
      if (typeof text === "string" && !isAnalyzing) {
        handleSend(text);
      }
    };
    window.addEventListener("analyst-suggestion", handler);
    return () => window.removeEventListener("analyst-suggestion", handler);
  }, [isAnalyzing, messages]);

  // Show estimated progress steps while waiting for the backend pipeline.
  // These are NOT live telemetry from the server — they are client-side
  // approximations of the pipeline stages to give the analyst visual feedback.
  // Real agent steps arrive in the response and replace these on completion.
  useEffect(() => {
    if (!isAnalyzing) return;

    const simulatedSteps: AgentStep[] = [
      { agent: "orchestrator", phase: 1, action: "Analyzing query intent", detail: "Classifying query and extracting entities...", status: "running", timestamp: Date.now() },
      { agent: "orchestrator", phase: 1, action: "Intent classified", detail: "Selecting retrieval strategy...", status: "complete", timestamp: Date.now(), durationMs: 800 },
      { agent: "graph_retriever", phase: 2, action: "Querying Knowledge Graph", detail: "Traversing knowledge graph...", status: "running", timestamp: Date.now() },
      { agent: "indexer_retriever", phase: 3, action: "Searching Wazuh Indexer", detail: "Querying wazuh-alerts-* and wazuh-states-vulnerabilities-*...", status: "running", timestamp: Date.now() },
      { agent: "graph_retriever", phase: 2, action: "Graph retrieval complete", detail: "Retrieved data from KG layers...", status: "complete", timestamp: Date.now(), durationMs: 1200 },
      { agent: "indexer_retriever", phase: 3, action: "Indexer search complete", detail: "Retrieved alerts and events...", status: "complete", timestamp: Date.now(), durationMs: 1500 },
      { agent: "synthesizer", phase: 4, action: "Generating analysis", detail: "Synthesizing from retrieved sources...", status: "running", timestamp: Date.now() },
      { agent: "safety_validator", phase: 4, action: "Validating output safety", detail: "Scanning for blocked patterns...", status: "running", timestamp: Date.now() },
    ];

    let stepIndex = 0;
    setLiveSteps([]);

    const interval = setInterval(() => {
      if (stepIndex < simulatedSteps.length) {
        setLiveSteps(prev => [...prev, simulatedSteps[stepIndex]]);
        stepIndex++;
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [isAnalyzing]);

  // Replay handler: re-animate steps one by one with timing
  const handleReplay = useCallback((messageId: string, steps: AgentStep[]) => {
    if (replayingId) return; // Already replaying
    setReplayingId(messageId);
    setReplaySteps([]);

    let i = 0;
    const timer = setInterval(() => {
      if (i < steps.length) {
        setReplaySteps(prev => [...prev, steps[i]]);
        i++;
      } else {
        clearInterval(timer);
        // Play analysis done chime at end of replay
        setTimeout(() => {
          SoundEngine.analysisDone();
          // Clear replay state after a brief pause
          setTimeout(() => {
            setReplayingId(null);
            setReplaySteps([]);
          }, 800);
        }, 300);
      }
    }, 600); // Slightly faster than original for replay

    return () => clearInterval(timer);
  }, [replayingId]);

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = overrideText ?? input.trim();
    if (!text || isAnalyzing) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsAnalyzing(true);
    setLiveSteps([]);

    const conversationHistory = messages.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    try {
      const result = await analystMutation.mutateAsync({
        query: text,
        conversationHistory,
      });

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.answer,
        reasoning: result.reasoning,
        sources: result.sources as ChatMessage["sources"],
        suggestedFollowUps: result.suggestedFollowUps,
        trustScore: result.trustScore,
        confidence: result.confidence,
        safetyStatus: result.safetyStatus,
        agentSteps: result.agentSteps,
        provenance: result.provenance,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMsg]);
      // The analysis done chime will play via the staggered reveal in AgentActivityConsole
    } catch (err) {
      // Play error sound
      SoundEngine.errorTone();

      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `**Analysis Error**\n\n${(err as Error).message || "An unexpected error occurred during analysis. Please try again."}\n\nThis may indicate:\n- The LLM service is temporarily unavailable\n- The query exceeded processing limits\n- A network connectivity issue`,
        trustScore: 0,
        confidence: 0,
        safetyStatus: "clean",
        agentSteps: [{
          agent: "orchestrator",
          phase: 0,
          action: "Pipeline error",
          detail: (err as Error).message || "Unknown error",
          status: "error",
          timestamp: Date.now(),
        }],
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsAnalyzing(false);
      setLiveSteps([]);
    }
  }, [input, isAnalyzing, messages, analystMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground">Security Analyst</h1>
              <p className="text-xs text-muted-foreground">Ad-hoc Analysis · Conversational Only · Not Persisted</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SoundToggle />
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
              >
                New conversation
              </button>
            )}
            {analystMutation.isError && (
              <div className="flex items-center gap-1.5 text-xs text-threat-high">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Pipeline error</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <WelcomeScreen />
        ) : (
          <div className="space-y-6">
            {messages.map(msg => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
                replayingId={replayingId}
                replaySteps={replaySteps}
                onReplayRequest={handleReplay}
              />
            ))}
            {isAnalyzing && <LiveAnalysisConsole steps={liveSteps} />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 px-6 py-4 border-t border-white/5">
        <div>
          <div className="glass-panel rounded-xl overflow-hidden flex items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a security question... (e.g., 'Show me critical vulnerabilities on agent 001')"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground px-4 py-3 resize-none outline-none min-h-[44px] max-h-[120px]"
              rows={1}
              disabled={isAnalyzing}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isAnalyzing}
              className="flex-shrink-0 p-3 text-purple-400 hover:text-purple-300 disabled:text-muted-foreground disabled:opacity-50 transition-colors"
            >
              {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Operates read-only with trust scoring and safety rails. Verify critical findings independently.
          </p>
        </div>
      </div>
    </div>
  );
}
