import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Cpu, Activity, Gauge, HardDrive, Zap, Clock, Server,
  CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw,
  BarChart3, Layers, MemoryStick, ChevronDown, ChevronRight,
  Terminal, BookOpen, FlaskConical, Workflow, Shield,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(mb: number | null): string {
  if (mb === null) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "bg-emerald-400 shadow-emerald-400/50",
    offline: "bg-red-400 shadow-red-400/50",
    degraded: "bg-amber-400 shadow-amber-400/50",
    unknown: "bg-zinc-400 shadow-zinc-400/50",
  };
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full shadow-lg ${colors[status] ?? colors.unknown}`} />
  );
}

function CollapsibleSection({
  icon: Icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: React.ElementType;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 p-5 hover:bg-white/[0.02] transition-colors text-left"
      >
        <Icon className="w-4 h-4 text-purple-400 shrink-0" />
        <h2 className="text-sm font-display font-semibold text-foreground flex-1">{title}</h2>
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-5 pb-5 border-t border-white/5 pt-4">{children}</div>}
    </div>
  );
}

// ── Benchmark Data (Section 5 of PDF) ──────────────────────────────────────

const BENCHMARKS = [
  { name: "AIME25 (No Tools)", fp16: 89.06, q8: 87.71, category: "Reasoning" },
  { name: "AIME25 (With Tools)", fp16: 99.17, q8: 98.80, category: "Reasoning" },
  { name: "GPQA (With Tools)", fp16: 75.00, q8: 73.40, category: "Reasoning" },
  { name: "LiveCodeBench", fp16: 68.25, q8: 67.62, category: "Code" },
  { name: "TauBench V2 (Avg)", fp16: 49.04, q8: 47.04, category: "Agentic" },
  { name: "BFCL v4", fp16: 53.76, q8: 53.15, category: "Tool Calling" },
  { name: "AA-LCR (Needle)", fp16: 35.85, q8: 36.06, category: "Long Context" },
];

// ── Memory Utilization Table (Section 3 of PDF) ───────────────────────────

const MEMORY_TABLE = [
  { context: "8K", weights: "40.4 GB", kvCache: "48 MB", totalMin: "40.45 GB" },
  { context: "128K", weights: "40.4 GB", kvCache: "768 MB", totalMin: "41.17 GB" },
  { context: "512K", weights: "40.4 GB", kvCache: "3.0 GB", totalMin: "43.40 GB" },
  { context: "1M", weights: "40.4 GB", kvCache: "6.0 GB", totalMin: "46.40 GB" },
];

// ── Inference Parameters (Section 4.3 of PDF) ─────────────────────────────

const INFERENCE_PARAMS = [
  { mode: "Tool Calling", temperature: "0.6", topP: "0.95", note: "NVIDIA mandated — lower variance for structured output" },
  { mode: "Conversational", temperature: "1.0", topP: "1.0", note: "Full creativity for natural language responses" },
];

// ── Main Page ──────────────────────────────────────────────────────────────

export default function DGXHealth(): React.JSX.Element {
  const dgxHealth = trpc.enhancedLLM.dgxHealth.useQuery(undefined, {
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const queueStats = trpc.enhancedLLM.queueStats.useQuery(undefined, {
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
  const sessionTypes = trpc.enhancedLLM.sessionTypes.useQuery();

  const h = dgxHealth.data;
  const q = queueStats.data;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-foreground">DGX Spark Health</h1>
            <p className="text-xs text-muted-foreground">Nemotron-3-Nano-30B-A3B inference engine monitoring</p>
          </div>
        </div>
        <button
          onClick={() => { dgxHealth.refetch(); queueStats.refetch(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${dgxHealth.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {dgxHealth.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        </div>
      ) : !h ? (
        <div className="glass-panel rounded-xl p-8 text-center">
          <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Unable to fetch DGX health metrics</p>
        </div>
      ) : (
        <>
          {/* Model Status Banner */}
          <div className={`glass-panel rounded-xl p-5 border ${
            h.modelStatus === "online" ? "border-emerald-500/30" :
            h.modelStatus === "degraded" ? "border-amber-500/30" :
            "border-red-500/30"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StatusDot status={h.modelStatus} />
                <div>
                  <p className="text-sm font-medium text-foreground capitalize">{h.modelStatus}</p>
                  <p className="text-xs text-muted-foreground">{h.endpoint || "No endpoint configured"}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Last check</p>
                <p className="text-xs font-mono text-foreground">
                  {new Date(h.lastHealthCheck).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </div>

          {/* KPI Cards Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            <div className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Server className="w-4 h-4 text-purple-400" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Model</span>
              </div>
              <p className="text-sm font-mono text-foreground truncate" title={h.modelName}>{h.modelName}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{h.quantization}</p>
            </div>

            <div className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Context</span>
              </div>
              <p className="text-lg font-display font-bold text-foreground">{h.contextSize ? `${(h.contextSize / 1024).toFixed(0)}K` : "--"}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{h.contextSize ? "tokens max" : "not probed"}</p>
            </div>

            <div className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Decode</span>
              </div>
              <p className="text-lg font-display font-bold text-foreground">
                {h.decodeTokensPerSec !== null ? `${h.decodeTokensPerSec}` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">tok/s</p>
            </div>

            <div className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Prefill</span>
              </div>
              <p className="text-lg font-display font-bold text-foreground">
                {h.prefillTokensPerSec !== null ? `${h.prefillTokensPerSec}` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">tok/s</p>
            </div>

            <div className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-pink-400" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Active</span>
              </div>
              <p className="text-lg font-display font-bold text-foreground">{h.activeRequests}</p>
              <p className="text-[10px] text-muted-foreground mt-1">requests</p>
            </div>

            <div className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Gauge className="w-4 h-4 text-violet-400" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Queue</span>
              </div>
              <p className="text-lg font-display font-bold text-foreground">{q?.queueDepth ?? h.queueDepth}</p>
              <p className="text-[10px] text-muted-foreground mt-1">pending</p>
            </div>
          </div>

          {/* Memory Usage */}
          <div className="glass-panel rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <MemoryStick className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-display font-semibold text-foreground">Memory Usage</h2>
              <span className="text-[10px] text-muted-foreground ml-auto">
                {formatBytes(h.memoryUsage.totalMB)} total (assumed — not probed from hardware)
              </span>
            </div>

            <div className="h-6 rounded-lg bg-white/5 overflow-hidden flex">
              {h.memoryUsage.modelWeightsMB !== null && (
                <div
                  className="h-full bg-purple-500/60 flex items-center justify-center text-[9px] font-mono text-white/80"
                  style={{ width: `${((h.memoryUsage.modelWeightsMB ?? 0) / (h.memoryUsage.totalMB ?? 1)) * 100}%` }}
                  title={`Model Weights: ${formatBytes(h.memoryUsage.modelWeightsMB)}`}
                >
                  Weights
                </div>
              )}
              {h.memoryUsage.kvCacheMB !== null && h.memoryUsage.kvCacheMB > 0 && (
                <div
                  className="h-full bg-cyan-500/60 flex items-center justify-center text-[9px] font-mono text-white/80"
                  style={{ width: `${Math.max(((h.memoryUsage.kvCacheMB ?? 0) / (h.memoryUsage.totalMB ?? 1)) * 100, 1)}%` }}
                  title={`KV Cache: ${formatBytes(h.memoryUsage.kvCacheMB)}`}
                >
                  KV
                </div>
              )}
              {h.memoryUsage.availableMB !== null && (
                <div
                  className="h-full bg-emerald-500/20 flex items-center justify-center text-[9px] font-mono text-white/40 flex-1"
                  title={`Available: ${formatBytes(h.memoryUsage.availableMB)}`}
                >
                  Available
                </div>
              )}
            </div>

            <div className="flex items-center gap-6 mt-3">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-purple-500/60" />
                <span className="text-[10px] text-muted-foreground">
                  Model Weights: ~{formatBytes(h.memoryUsage.modelWeightsMB)} (est.)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-cyan-500/60" />
                <span className="text-[10px] text-muted-foreground">
                  KV Cache: ~{formatBytes(h.memoryUsage.kvCacheMB)} (est.)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-500/20" />
                <span className="text-[10px] text-muted-foreground">
                  Available: {formatBytes(h.memoryUsage.availableMB)}
                </span>
              </div>
            </div>
          </div>

          {/* Session Types Reference */}
          <div className="glass-panel rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-display font-semibold text-foreground">Session Type Allocation</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Session Type</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Context Size</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Max Tokens</th>
                    <th className="text-center py-2 px-3 text-muted-foreground font-medium">Reasoning</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {(sessionTypes.data ?? []).map(st => (
                    <tr key={st.type} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3 font-mono text-foreground capitalize">{st.type.replace(/_/g, " ")}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-cyan-400">{(st.ctxSize / 1024).toFixed(0)}K</td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-400">{(st.maxTokens / 1024).toFixed(0)}K</td>
                      <td className="py-2.5 px-3 text-center">
                        {st.enableReasoning ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-zinc-500 mx-auto" />
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{st.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Benchmark Performance (Section 5 of PDF) ──────────────────── */}
          <CollapsibleSection icon={FlaskConical} title="Benchmark Performance (Q8_K_XL vs FP16)" defaultOpen>
            <p className="text-xs text-muted-foreground mb-4">
              Quantization impact analysis from the Nemotron-3-Nano-30B-A3B technical analysis.
              Q8_K_XL retains near-FP16 accuracy across all benchmarks.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Benchmark</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Category</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">FP16</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Q8/FP8</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {BENCHMARKS.map(b => {
                    const delta = b.q8 - b.fp16;
                    const deltaColor = delta >= 0 ? "text-emerald-400" : delta > -2 ? "text-amber-400" : "text-red-400";
                    return (
                      <tr key={b.name} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="py-2.5 px-3 font-mono text-foreground">{b.name}</td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            b.category === "Reasoning" ? "bg-purple-500/15 text-purple-300" :
                            b.category === "Code" ? "bg-cyan-500/15 text-cyan-300" :
                            b.category === "Agentic" ? "bg-amber-500/15 text-amber-300" :
                            b.category === "Tool Calling" ? "bg-emerald-500/15 text-emerald-300" :
                            "bg-pink-500/15 text-pink-300"
                          }`}>
                            {b.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-foreground">{b.fp16.toFixed(2)}%</td>
                        <td className="py-2.5 px-3 text-right font-mono text-foreground">{b.q8.toFixed(2)}%</td>
                        <td className={`py-2.5 px-3 text-right font-mono ${deltaColor}`}>
                          {delta >= 0 ? "+" : ""}{delta.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>

          {/* ── Inference Parameters (Section 4.3 of PDF) ─────────────────── */}
          <CollapsibleSection icon={Shield} title="NVIDIA-Mandated Inference Parameters" defaultOpen>
            <p className="text-xs text-muted-foreground mb-4">
              Temperature and top_p values are NVIDIA-mandated for optimal tool-calling fidelity.
              Deviating causes 86% parser failure rate without XML schema reminder in system prompt.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Inference Mode</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Temperature</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Top P</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {INFERENCE_PARAMS.map(p => (
                    <tr key={p.mode} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3 font-mono text-foreground">{p.mode}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-cyan-400">{p.temperature}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-400">{p.topP}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{p.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* XML Tool Call Format */}
            <div className="mt-4 p-3 rounded-lg bg-white/[0.03] border border-white/5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">XML Tool-Call Format (Nemotron Native)</p>
              <pre className="text-[11px] font-mono text-purple-300 whitespace-pre overflow-x-auto">
{`<tool_call>
<function=search_alerts>
<parameter=agentId>
001
</parameter>
<parameter=level>
12
</parameter>
</function>
</tool_call>`}
              </pre>
              <p className="text-[10px] text-muted-foreground mt-2">
                Dang! auto-converts XML tool calls to OpenAI JSON format for pipeline compatibility.
                The XML schema reminder is injected into every system prompt when tools are enabled.
              </p>
            </div>
          </CollapsibleSection>

          {/* ── Memory Utilization by Context (Section 3 of PDF) ──────────── */}
          <CollapsibleSection icon={MemoryStick} title="Memory Utilization by Context Size">
            <p className="text-xs text-muted-foreground mb-4">
              KV cache grows linearly with context length. Only 6 attention layers maintain KV state
              (Mamba-2 layers use constant-size SSM state), making large contexts cheap compared to pure transformers.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Context Window</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Model Weights</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">KV Cache</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Total Minimum</th>
                  </tr>
                </thead>
                <tbody>
                  {MEMORY_TABLE.map(m => (
                    <tr key={m.context} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2.5 px-3 font-mono text-foreground">{m.context}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-purple-300">{m.weights}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-cyan-300">{m.kvCache}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-foreground font-semibold">{m.totalMin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground mt-3">
              GGUF file: <span className="font-mono">Nemotron-3-Nano-30B-A3B-UD-Q8_K_XL.gguf</span> (40.4 GB).
              SHA256: <span className="font-mono text-[9px]">34e7f21c...0033681</span>
            </p>
          </CollapsibleSection>

          {/* ── Deployment Topology (Section 6 of PDF) ────────────────────── */}
          <CollapsibleSection icon={Terminal} title="Deployment Topology Reference">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* llama.cpp */}
              <div>
                <h3 className="text-xs font-display font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  llama.cpp (Local / Edge)
                </h3>
                <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Recommended Server Flags</p>
                  <pre className="text-[11px] font-mono text-emerald-300 whitespace-pre overflow-x-auto leading-relaxed">
{`llama-server \\
  --model ./Nemotron-3-Nano-30B-A3B-UD-Q8_K_XL.gguf \\
  --ctx-size 131000 \\
  -fa on \\
  --special \\
  --n-gpu-layers 99 \\
  --parallel 2 \\
  --port 30000`}
                  </pre>
                  <div className="text-[10px] text-muted-foreground space-y-1 mt-2">
                    <p><span className="font-mono text-cyan-400">--ctx-size 131000</span> — practical limit (not full 1M)</p>
                    <p><span className="font-mono text-cyan-400">-fa on</span> — Flash Attention (critical for 6 attention layers)</p>
                    <p><span className="font-mono text-cyan-400">--special</span> — interpret &lt;think&gt;/&lt;/think&gt; tokens</p>
                    <p><span className="font-mono text-cyan-400">--n-gpu-layers 99</span> — offload all layers to GPU</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    DGX Spark (GB10): <span className="font-mono">-DCMAKE_CUDA_ARCHITECTURES=&quot;121&quot;</span>
                  </p>
                </div>
              </div>

              {/* vLLM */}
              <div>
                <h3 className="text-xs font-display font-semibold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  vLLM (Enterprise)
                </h3>
                <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Required Configuration</p>
                  <pre className="text-[11px] font-mono text-purple-300 whitespace-pre overflow-x-auto leading-relaxed">
{`vllm serve nvidia/Nemotron-3-Nano-30B-A3B \\
  --tool-call-parser qwen3_coder \\
  --reasoning-parser nano_v3_reasoning_parser \\
  --max-model-len 131072 \\
  --tensor-parallel-size 2`}
                  </pre>
                  <div className="text-[10px] text-muted-foreground space-y-1 mt-2">
                    <p><span className="font-mono text-purple-400">--tool-call-parser qwen3_coder</span> — converts XML to OpenAI JSON</p>
                    <p><span className="font-mono text-purple-400">nano_v3_reasoning_parser</span> — custom reasoning plugin</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Blackwell: <span className="font-mono">VLLM_USE_FLASHINFER_MOE_FP8=1</span>
                  </p>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* ── Architecture Reference (Section 1 of PDF) ─────────────────── */}
          <CollapsibleSection icon={HardDrive} title="Architecture Reference">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="space-y-2">
                <p className="text-muted-foreground font-medium">Model Architecture</p>
                <div className="space-y-1 font-mono text-foreground">
                  <p>Nemotron-3-Nano-30B (A3B active)</p>
                  <p>Hybrid Mamba-2 + Transformer MoE</p>
                  <p>52 layers: 46 Mamba-2, 6 GQA Attention</p>
                  <p>128 experts per MoE, 5-6 active/token</p>
                  <p>1 shared expert per MoE layer</p>
                  <p>31.6B total params, ~3.2-3.6B active</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-muted-foreground font-medium">Quantization &amp; Training</p>
                <div className="space-y-1 font-mono text-foreground">
                  <p>Q8_K_XL (8-bit K-quant, extra-large)</p>
                  <p>~40.4 GB model weights</p>
                  <p>No Positional Embeddings (NoPE)</p>
                  <p>Un-tied input/output embeddings</p>
                  <p>RMSNorm, squared ReLU activations</p>
                  <p>25T token pre-training corpus</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-muted-foreground font-medium">DGX Spark Hardware</p>
                <div className="space-y-1 font-mono text-foreground">
                  <p>Grace Blackwell GB10 (SM 12.0)</p>
                  <p>128 GB unified LPDDR5x</p>
                  <p>273 GB/s memory bandwidth</p>
                  <p>20 ARM Neoverse V2 cores</p>
                  <p>1M token context window</p>
                  <p>~6 KB per token KV cache</p>
                </div>
              </div>
            </div>

            {/* Thinking Paradigm */}
            <div className="mt-4 p-3 rounded-lg bg-white/[0.03] border border-white/5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Thinking Paradigm</p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Uses <span className="font-mono text-purple-300">&lt;think&gt;...&lt;/think&gt;</span> tags (Token IDs 12 &amp; 13) for chain-of-thought reasoning before tool calls.</p>
                <p>Jinja chat template with <span className="font-mono text-cyan-300">&lt;|im_start|&gt;</span> and <span className="font-mono text-cyan-300">&lt;|im_end|&gt;</span> delimiters.</p>
                <p>Disabling thinking traces increases tool hallucination rate — reasoning is enabled for investigation, deep_dive, and threat_hunt sessions.</p>
              </div>
            </div>
          </CollapsibleSection>

          {/* ── Pre-Training Data (Section 2 of PDF) ──────────────────────── */}
          <CollapsibleSection icon={BookOpen} title="Pre-Training &amp; Post-Training">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <p className="text-muted-foreground font-medium">Pre-Training</p>
                <div className="space-y-1 text-foreground">
                  <p><span className="font-mono text-cyan-400">25T</span> token corpus</p>
                  <p>Cutoff: June 25, 2025</p>
                  <p>Nemotron-CC-Code-v1: 427.92B code tokens</p>
                  <p>HTML-aware (Lynx-rendered) training data</p>
                  <p>Understands DOM hierarchy natively</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-muted-foreground font-medium">Post-Training</p>
                <div className="space-y-1 text-foreground">
                  <p>Extended to November 28, 2025</p>
                  <p>SFT: 2M Python + 1M C++ samples</p>
                  <p>RLHF/RLAIF via NeMo Gym</p>
                  <p>Multi-step agentic reasoning focus</p>
                  <p>Tool hallucination mitigation training</p>
                </div>
              </div>
            </div>
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}
