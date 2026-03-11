import {
  Globe, Box, Layers, AlertTriangle, Database, FileText, Key, Activity,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  relationship: string;
}

export interface RiskPath {
  id: string;
  hops: Array<{ nodeId: string; nodeType: string; label: string; stage: string; riskLevel?: string; properties: Record<string, unknown> }>;
  score: number;
  riskLevel: string;
  summary: string;
}

// ── Node Config ─────────────────────────────────────────────────────────────

export const NODE_CONFIG: Record<string, { color: string; icon: typeof Globe; size: number; layer: string }> = {
  resource:      { color: "#a78bfa", icon: Box,           size: 28, layer: "API Ontology" },
  endpoint:      { color: "#818cf8", icon: Globe,         size: 18, layer: "API Ontology" },
  parameter:     { color: "#60a5fa", icon: FileText,      size: 12, layer: "API Ontology" },
  response:      { color: "#38bdf8", icon: FileText,      size: 12, layer: "API Ontology" },
  auth_method:   { color: "#c084fc", icon: Key,           size: 20, layer: "API Ontology" },
  use_case:      { color: "#34d399", icon: Activity,      size: 22, layer: "Operational Semantics" },
  index:         { color: "#fbbf24", icon: Database,       size: 22, layer: "Schema Lineage" },
  field:         { color: "#fb923c", icon: Layers,         size: 12, layer: "Schema Lineage" },
  error_pattern: { color: "#f87171", icon: AlertTriangle,  size: 20, layer: "Error & Failure" },
};

export const RISK_COLORS: Record<string, string> = {
  SAFE: "#34d399",
  MUTATING: "#fbbf24",
  DESTRUCTIVE: "#ef4444",
};

export const LAYER_COLORS: Record<string, string> = {
  "API Ontology": "#818cf8",
  "Operational Semantics": "#34d399",
  "Schema Lineage": "#fbbf24",
  "Error & Failure": "#f87171",
};

export const METHOD_COLORS: Record<string, string> = {
  GET: "#34d399",
  POST: "#60a5fa",
  PUT: "#fbbf24",
  DELETE: "#ef4444",
};
