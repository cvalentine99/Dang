import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import * as d3 from "d3";
import {
  ZoomIn, ZoomOut, Maximize2, Loader2, Info, Route,
  EyeOff, Database, MousePointerClick,
} from "lucide-react";
import { toast } from "sonner";

import {
  NodeDetailPanel,
  GraphLegend,
  RiskPathPanel,
  StatsOverlay,
  EndpointTableView,
  AddToInvestigationDialog,
  GraphContextMenu,
  MultiSelectToolbar,
  GraphToolbar,
  NODE_CONFIG,
  RISK_COLORS,
  METHOD_COLORS,
} from "./knowledge-graph";
import type { GraphNode, GraphEdge, RiskPath } from "./knowledge-graph";

// ── Main Knowledge Graph Page ───────────────────────────────────────────────

export default function KnowledgeGraph(): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(Object.keys(NODE_CONFIG)));
  const [showRiskPaths, setShowRiskPaths] = useState(false);
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [layerFilter, setLayerFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<"graph" | "table">("graph");

  // Expansion state
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [extraNodes, setExtraNodes] = useState<GraphNode[]>([]);
  const [extraEdges, setExtraEdges] = useState<GraphEdge[]>([]);
  const [expandLoading, setExpandLoading] = useState(false);

  // Pulse-highlight state for search-to-focus
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: GraphNode } | null>(null);

  // Hidden and pinned nodes
  const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());
  const [pinnedNodes, setPinnedNodes] = useState<Set<string>>(new Set());

  // Add to Investigation dialog
  const [investigationDialog, setInvestigationDialog] = useState<{ node: GraphNode } | null>(null);

  // Multi-select mode
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());

  // Lasso/rubber-band selection state
  const lassoRef = useRef<{ startX: number; startY: number; active: boolean }>({ startX: 0, startY: 0, active: false });
  const [lassoRect, setLassoRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const selectedNodesRef = useRef<Set<string>>(selectedNodes);
  selectedNodesRef.current = selectedNodes;

  // ── Data Queries ─────────────────────────────────────────────────────────

  const overviewQuery = trpc.graph.overviewGraph.useQuery(
    { layer: layerFilter as any, riskLevel: riskFilter as any, limit: 100 },
  );
  const statsQuery = trpc.graph.graphStats.useQuery();
  const searchResults = trpc.graph.searchGraph.useQuery(
    { query: searchQuery, limit: 30 },
    { enabled: searchQuery.length >= 2 }
  );
  const riskPathQuery = trpc.graph.detectRiskPaths.useQuery(
    { minScore: 40, limit: 20 },
    { enabled: showRiskPaths }
  );

  const riskPaths: RiskPath[] = useMemo(() => {
    if (!riskPathQuery.data) return [];
    return (riskPathQuery.data as any).paths ?? [];
  }, [riskPathQuery.data]);

  const graphData = overviewQuery.data;
  const isLoading = overviewQuery.isLoading;

  const selectedPath = useMemo(() => {
    if (!selectedPathId) return null;
    return riskPaths.find(p => p.id === selectedPathId) ?? null;
  }, [selectedPathId, riskPaths]);

  const riskPathNodeIds = useMemo(() => {
    if (!selectedPath) return new Set<string>();
    return new Set(selectedPath.hops.map(h => h.nodeId));
  }, [selectedPath]);

  // ── Filtered Data ────────────────────────────────────────────────────────

  const filteredData = useMemo(() => {
    if (!graphData) return { nodes: [], edges: [] };
    const allNodes = [...graphData.nodes, ...extraNodes];
    const allEdges = [...graphData.edges, ...extraEdges];
    const filteredNodes = allNodes.filter((n: any) => activeFilters.has(n.type) && !hiddenNodes.has(n.id));
    const nodeIds = new Set(filteredNodes.map((n: any) => n.id));
    const filteredEdges = allEdges.filter((e: any) => {
      const sourceId = typeof e.source === "string" ? e.source : e.source.id;
      const targetId = typeof e.target === "string" ? e.target : e.target.id;
      return nodeIds.has(sourceId) && nodeIds.has(targetId);
    });
    const seen = new Set<string>();
    const uniqueNodes = filteredNodes.filter((n: any) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
    return { nodes: uniqueNodes, edges: filteredEdges };
  }, [graphData, extraNodes, extraEdges, activeFilters, hiddenNodes]);

  // Reset expansion when base graph changes
  useEffect(() => {
    setExpandedNodes(new Set());
    setExtraNodes([]);
    setExtraEdges([]);
  }, [graphData]);

  // ── Node Expansion Handler ──────────────────────────────────────────────

  const utils = trpc.useUtils();

  const handleExpand = useCallback(async (node: GraphNode) => {
    if (expandedNodes.has(node.id)) return;
    setExpandLoading(true);

    try {
      let newData: { nodes: any[]; edges: any[] } = { nodes: [], edges: [] };

      if (node.type === "resource") {
        const resourceName = node.properties.endpointCount !== undefined
          ? node.label
          : (node.properties.name as string) ?? node.label;
        newData = await utils.graph.endpointsByResource.fetch({ resource: resourceName });
      } else if (node.type === "endpoint") {
        const idStr = node.id.replace("endpoint-", "");
        const endpointId = parseInt(idStr, 10);
        if (!isNaN(endpointId)) {
          newData = await utils.graph.endpointDetail.fetch({ endpointId });
        }
      }

      if (newData.nodes.length > 0) {
        const existingIds = new Set([
          ...filteredData.nodes.map((n: any) => n.id),
          ...extraNodes.map(n => n.id),
        ]);
        const brandNew = newData.nodes.filter((n: any) => !existingIds.has(n.id));
        const brandNewEdges = newData.edges.filter((e: any) => {
          const sid = typeof e.source === "string" ? e.source : e.source.id;
          const tid = typeof e.target === "string" ? e.target : e.target.id;
          return !extraEdges.some((ee: any) => {
            const esid = typeof ee.source === "string" ? ee.source : ee.source.id;
            const etid = typeof ee.target === "string" ? ee.target : ee.target.id;
            return esid === sid && etid === tid;
          });
        });

        const parentNode = nodesRef.current.find(n => n.id === node.id);
        const px = parentNode?.x ?? 0;
        const py = parentNode?.y ?? 0;
        for (const n of brandNew) {
          (n as any).x = px + (Math.random() - 0.5) * 80;
          (n as any).y = py + (Math.random() - 0.5) * 80;
        }

        setExtraNodes(prev => [...prev, ...brandNew]);
        setExtraEdges(prev => [...prev, ...brandNewEdges]);
      }

      setExpandedNodes(prev => { const next = new Set(Array.from(prev)); next.add(node.id); return next; });
    } catch (err) {
      console.error("Expansion failed:", err);
    } finally {
      setExpandLoading(false);
    }
  }, [expandedNodes, filteredData, extraNodes, extraEdges, utils]);

  // ── Search-to-Focus Handler ─────────────────────────────────────────────

  const handleSearchSelect = useCallback((searchNode: any) => {
    setSelectedNode(searchNode);
    setSearchQuery("");

    const targetNode = nodesRef.current.find(n => n.id === searchNode.id);
    if (targetNode && svgRef.current && zoomRef.current) {
      const svg = d3.select(svgRef.current);
      const container = containerRef.current;
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;

      const scale = 1.8;
      const tx = width / 2 - scale * (targetNode.x ?? 0);
      const ty = height / 2 - scale * (targetNode.y ?? 0);

      svg.transition().duration(750).call(
        zoomRef.current.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale)
      );

      setFocusNodeId(searchNode.id);
      setTimeout(() => setFocusNodeId(null), 2500);
    }
  }, []);

  // ── D3 Force Simulation ─────────────────────────────────────────────────

  useEffect(() => {
    if (viewMode !== "graph") return;
    if (!svgRef.current || !containerRef.current || filteredData.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.selectAll("*").remove();

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .filter((event) => {
        if (event.type === "wheel") return true;
        if (event.shiftKey || multiSelectMode) return false;
        return !event.button;
      })
      .on("zoom", (event) => { g.attr("transform", event.transform); });

    zoomRef.current = zoom;
    svg.call(zoom);

    // Lasso rubber-band selection
    svg.on("mousedown.lasso", (event: MouseEvent) => {
      if (!event.shiftKey && !multiSelectMode) return;
      if ((event.target as Element).closest(".kg-node")) return;
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      lassoRef.current = { startX: event.clientX - rect.left, startY: event.clientY - rect.top, active: true };
      if (!multiSelectMode) setMultiSelectMode(true);
    });

    svg.on("mousemove.lasso", (event: MouseEvent) => {
      if (!lassoRef.current.active) return;
      const rect = container.getBoundingClientRect();
      const cx = event.clientX - rect.left;
      const cy = event.clientY - rect.top;
      const sx = lassoRef.current.startX;
      const sy = lassoRef.current.startY;
      setLassoRect({ x: Math.min(sx, cx), y: Math.min(sy, cy), w: Math.abs(cx - sx), h: Math.abs(cy - sy) });
    });

    svg.on("mouseup.lasso", () => {
      if (!lassoRef.current.active) return;
      lassoRef.current.active = false;
      const currentTransform = d3.zoomTransform(svg.node()!);
      const newSelected = new Set(Array.from(selectedNodesRef.current));

      nodesRef.current.forEach(n => {
        if (!n.x || !n.y) return;
        const screenX = currentTransform.applyX(n.x);
        const screenY = currentTransform.applyY(n.y);
        const lRect = document.querySelector(".lasso-overlay");
        if (!lRect) return;
        const lx = parseFloat(lRect.getAttribute("data-x") ?? "0");
        const ly = parseFloat(lRect.getAttribute("data-y") ?? "0");
        const lw = parseFloat(lRect.getAttribute("data-w") ?? "0");
        const lh = parseFloat(lRect.getAttribute("data-h") ?? "0");
        if (screenX >= lx && screenX <= lx + lw && screenY >= ly && screenY <= ly + lh) {
          newSelected.add(n.id);
        }
      });

      setSelectedNodes(newSelected);
      setLassoRect(null);
    });

    const g = svg.append("g");

    // Defs for glow effects
    const defs = svg.append("defs");
    const glowFilter = defs.append("filter").attr("id", "risk-glow");
    glowFilter.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "coloredBlur");
    const feMerge = glowFilter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const pulseFilter = defs.append("filter").attr("id", "pulse-glow");
    pulseFilter.append("feGaussianBlur").attr("stdDeviation", "6").attr("result", "coloredBlur");
    const pulseMerge = pulseFilter.append("feMerge");
    pulseMerge.append("feMergeNode").attr("in", "coloredBlur");
    pulseMerge.append("feMergeNode").attr("in", "SourceGraphic");

    defs.append("style").text(`
      @keyframes dash-flow { to { stroke-dashoffset: -20; } }
      .risk-path-edge { animation: dash-flow 1s linear infinite; }
      @keyframes pulse-ring { 0% { r: 16; opacity: 0.8; } 50% { r: 28; opacity: 0.3; } 100% { r: 16; opacity: 0.8; } }
      .pulse-ring { animation: pulse-ring 1s ease-in-out infinite; }
    `);

    const nodes = filteredData.nodes.map((n: any) => ({ ...n })) as GraphNode[];
    const edges = filteredData.edges.map((e: any) => ({ ...e })) as GraphEdge[];
    nodesRef.current = nodes;

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink<GraphNode, GraphEdge>(edges).id(d => d.id).distance((d: any) => {
        const sourceType = typeof d.source === "string" ? "" : (d.source as GraphNode).type;
        return sourceType === "resource" ? 120 : sourceType === "index" ? 100 : 60;
      }))
      .force("charge", d3.forceManyBody().strength((d: any) => {
        return d.type === "resource" ? -400 : d.type === "use_case" || d.type === "index" ? -250 : -120;
      }))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d: any) => (NODE_CONFIG[d.type]?.size ?? 16) / 2 + 8));

    simulationRef.current = simulation;

    // Draw edges
    const link = g.append("g")
      .selectAll("line")
      .data(edges)
      .join("line")
      .attr("stroke", (d: any) => {
        const rel = d.relationship;
        if (rel === "CONTAINS") return "rgba(129,140,248,0.15)";
        if (rel === "USES") return "rgba(52,211,153,0.15)";
        if (rel === "WRITES_TO") return "rgba(251,191,36,0.15)";
        if (rel === "CAN_THROW") return "rgba(248,113,113,0.15)";
        if (rel === "HAS_FIELD") return "rgba(251,146,60,0.12)";
        if (rel === "ACCEPTS") return "rgba(96,165,250,0.15)";
        if (rel === "RETURNS") return "rgba(56,189,248,0.15)";
        return "rgba(255,255,255,0.06)";
      })
      .attr("stroke-width", (d: any) => d.relationship === "CONTAINS" ? 1.5 : 1);

    // Edge labels
    const linkLabel = g.append("g")
      .selectAll("text")
      .data(edges)
      .join("text")
      .text((d: any) => d.relationship)
      .attr("font-size", "7px")
      .attr("fill", "rgba(255,255,255,0.15)")
      .attr("font-family", "'JetBrains Mono', monospace")
      .attr("text-anchor", "middle");

    // Risk path overlay group
    const riskEdgeGroup = g.append("g").attr("class", "risk-edges");

    // Draw nodes
    const node = g.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", "kg-node")
      .style("cursor", "pointer")
      .call(d3.drag<any, GraphNode>()
        .on("start", (event: any, d: GraphNode) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (event: any, d: GraphNode) => { d.fx = event.x; d.fy = event.y; })
        .on("end", (event: any, d: GraphNode) => {
          if (!event.active) simulation.alphaTarget(0);
          if (!pinnedNodes.has(d.id)) { d.fx = null; d.fy = null; }
        })
      );

    // Node circles
    node.append("circle")
      .attr("r", (d: any) => (NODE_CONFIG[d.type]?.size ?? 16) / 2 + 4)
      .attr("fill", (d: any) => {
        if (d.type === "endpoint" && d.properties.riskLevel) {
          const rc = RISK_COLORS[d.properties.riskLevel as string] ?? NODE_CONFIG[d.type]?.color ?? "#888";
          return `${rc}15`;
        }
        return `${NODE_CONFIG[d.type]?.color ?? "#888"}15`;
      })
      .attr("stroke", (d: any) => {
        if (d.type === "endpoint" && d.properties.riskLevel) {
          return `${RISK_COLORS[d.properties.riskLevel as string] ?? "#888"}60`;
        }
        return `${NODE_CONFIG[d.type]?.color ?? "#888"}60`;
      })
      .attr("stroke-width", 1.5);

    // Risk glow ring
    node.append("circle")
      .attr("class", "risk-glow")
      .attr("r", (d: any) => (NODE_CONFIG[d.type]?.size ?? 16) / 2 + 8)
      .attr("fill", "none")
      .attr("stroke", "transparent")
      .attr("stroke-width", 0)
      .attr("filter", "url(#risk-glow)");

    // Pulse ring for search-to-focus
    node.append("circle")
      .attr("class", (d: any) => `focus-ring focus-ring-${d.id.replace(/[^a-zA-Z0-9-]/g, "_")}`)
      .attr("r", 16)
      .attr("fill", "none")
      .attr("stroke", "transparent")
      .attr("stroke-width", 0);

    // Multi-select ring
    node.append("circle")
      .attr("class", (d: any) => `select-ring select-ring-${d.id.replace(/[^a-zA-Z0-9-]/g, "_")}`)
      .attr("r", (d: any) => (NODE_CONFIG[d.type]?.size ?? 16) / 2 + 10)
      .attr("fill", "none")
      .attr("stroke", "transparent")
      .attr("stroke-width", 0)
      .attr("stroke-dasharray", "4 2");

    // Method badge for endpoints
    node.filter((d: any) => d.type === "endpoint")
      .append("text")
      .text((d: any) => d.properties.method ?? "")
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("font-size", "7px")
      .attr("font-weight", "bold")
      .attr("fill", (d: any) => METHOD_COLORS[d.properties.method as string] ?? "#888")
      .attr("font-family", "'JetBrains Mono', monospace");

    // LLM lock icon
    node.filter((d: any) => d.type === "endpoint" && !d.properties.llmAllowed)
      .append("text")
      .text("🔒")
      .attr("dx", (d: any) => (NODE_CONFIG[d.type]?.size ?? 16) / 2 + 4)
      .attr("dy", "-4")
      .attr("font-size", "8px");

    // Expansion indicator
    node.filter((d: any) => d.type === "resource" || d.type === "endpoint")
      .append("text")
      .text((d: any) => expandedNodes.has(d.id) ? "−" : "+")
      .attr("dx", (d: any) => -((NODE_CONFIG[d.type]?.size ?? 16) / 2 + 6))
      .attr("dy", "-4")
      .attr("font-size", "10px")
      .attr("font-weight", "bold")
      .attr("fill", (d: any) => expandedNodes.has(d.id) ? "#34d399" : "#a78bfa")
      .attr("font-family", "'JetBrains Mono', monospace")
      .style("pointer-events", "none");

    // Node labels
    node.append("text")
      .text((d: any) => {
        const label = d.label;
        if (d.type === "endpoint") {
          const path = d.properties.path as string ?? label;
          return path.length > 24 ? path.slice(0, 22) + "…" : path;
        }
        return label.length > 20 ? label.slice(0, 18) + "…" : label;
      })
      .attr("dy", (d: any) => (NODE_CONFIG[d.type]?.size ?? 16) / 2 + 14)
      .attr("text-anchor", "middle")
      .attr("font-size", "8px")
      .attr("fill", "rgba(255,255,255,0.45)")
      .attr("font-family", (d: any) => d.type === "endpoint" ? "'JetBrains Mono', monospace" : "'Inter', sans-serif");

    // Click handler
    let clickTimer: ReturnType<typeof setTimeout> | null = null;

    node.on("click", (event: any, d: any) => {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        if (d.type === "resource" || d.type === "endpoint") handleExpand(d);
      } else {
        clickTimer = setTimeout(() => {
          clickTimer = null;
          if (multiSelectMode || event.shiftKey) {
            setSelectedNodes(prev => {
              const next = new Set(Array.from(prev));
              if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
              return next;
            });
            if (!multiSelectMode && event.shiftKey) setMultiSelectMode(true);
          } else {
            setSelectedNode(d);
          }
        }, 250);
      }
    });

    // Right-click context menu
    node.on("contextmenu", (event: any, d: any) => {
      event.preventDefault();
      event.stopPropagation();
      const containerRect = container.getBoundingClientRect();
      setContextMenu({ x: event.clientX - containerRect.left, y: event.clientY - containerRect.top, node: d });
    });

    svg.on("click.contextmenu", () => setContextMenu(null));
    svg.on("contextmenu", (event: any) => {
      if (!(event.target as Element).closest(".kg-node")) {
        event.preventDefault();
        setContextMenu(null);
      }
    });

    // Hover effects
    node.on("mouseenter", function (_event: any, d: any) {
      d3.select(this).select("circle:first-child")
        .transition().duration(200)
        .attr("stroke-width", 3)
        .attr("fill", `${NODE_CONFIG[d.type]?.color ?? "#888"}30`);
    });
    node.on("mouseleave", function (_event: any, d: any) {
      d3.select(this).select("circle:first-child")
        .transition().duration(200)
        .attr("stroke-width", 1.5)
        .attr("fill", `${NODE_CONFIG[d.type]?.color ?? "#888"}15`);
    });

    // Tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => (d.source as GraphNode).x ?? 0)
        .attr("y1", (d: any) => (d.source as GraphNode).y ?? 0)
        .attr("x2", (d: any) => (d.target as GraphNode).x ?? 0)
        .attr("y2", (d: any) => (d.target as GraphNode).y ?? 0);

      linkLabel
        .attr("x", (d: any) => (((d.source as GraphNode).x ?? 0) + ((d.target as GraphNode).x ?? 0)) / 2)
        .attr("y", (d: any) => (((d.source as GraphNode).y ?? 0) + ((d.target as GraphNode).y ?? 0)) / 2);

      node.attr("transform", (d: any) => `translate(${d.x ?? 0},${d.y ?? 0})`);

      riskEdgeGroup.selectAll("line").each(function () {
        const el = d3.select(this);
        const sourceId = el.attr("data-source");
        const targetId = el.attr("data-target");
        const sourceNode = nodes.find(n => n.id === sourceId);
        const targetNode = nodes.find(n => n.id === targetId);
        if (sourceNode && targetNode) {
          el.attr("x1", sourceNode.x ?? 0).attr("y1", sourceNode.y ?? 0)
            .attr("x2", targetNode.x ?? 0).attr("y2", targetNode.y ?? 0);
        }
      });
    });

    // Initial zoom to fit
    setTimeout(() => {
      const bounds = (g.node() as SVGGElement)?.getBBox();
      if (bounds) {
        const dx = bounds.width + 100;
        const dy = bounds.height + 100;
        const x = bounds.x - 50;
        const y = bounds.y - 50;
        const scale = Math.min(0.9, Math.min(width / dx, height / dy));
        const translate = [width / 2 - scale * (x + dx / 2), height / 2 - scale * (y + dy / 2)];
        svg.transition().duration(750).call(
          zoom.transform,
          d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
        );
      }
    }, 1000);

    return () => { simulation.stop(); };
  }, [filteredData, viewMode, expandedNodes, handleExpand, multiSelectMode]);

  // ── Focus pulse effect ────────────────────────────────────────────────

  useEffect(() => {
    if (!focusNodeId || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const safeId = focusNodeId.replace(/[^a-zA-Z0-9-]/g, "_");

    svg.selectAll(`.focus-ring-${safeId}`)
      .attr("stroke", "#c084fc")
      .attr("stroke-width", 3)
      .attr("filter", "url(#pulse-glow)")
      .classed("pulse-ring", true);

    return () => {
      svg.selectAll(`.focus-ring-${safeId}`)
        .attr("stroke", "transparent")
        .attr("stroke-width", 0)
        .attr("filter", null)
        .classed("pulse-ring", false);
    };
  }, [focusNodeId]);

  // ── Multi-select visual highlighting ──────────────────────────────────

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll(".select-ring").attr("stroke", "transparent").attr("stroke-width", 0);
    selectedNodes.forEach(nodeId => {
      const safeId = nodeId.replace(/[^a-zA-Z0-9-]/g, "_");
      svg.selectAll(`.select-ring-${safeId}`).attr("stroke", "#22d3ee").attr("stroke-width", 2);
    });
  }, [selectedNodes]);

  // ── Escape key to clear multi-select ──────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && multiSelectMode) {
        setMultiSelectMode(false);
        setSelectedNodes(new Set());
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [multiSelectMode]);

  // ── Risk path highlighting ────────────────────────────────────────────

  useEffect(() => {
    if (!svgRef.current || viewMode !== "graph") return;
    const svg = d3.select(svgRef.current);
    const riskEdgeGroup = svg.select(".risk-edges");

    riskEdgeGroup.selectAll("*").remove();
    svg.selectAll(".risk-glow").attr("stroke", "transparent").attr("stroke-width", 0);

    if (selectedPath && riskPathNodeIds.size > 0) {
      svg.selectAll(".kg-node").each(function () {
        const el = d3.select(this);
        const datum = el.datum() as GraphNode | undefined;
        if (datum && datum.id) {
          if (riskPathNodeIds.has(datum.id)) {
            el.attr("opacity", 1);
            const riskLevel = selectedPath.hops.find(h => h.nodeId === datum.id)?.riskLevel ?? "SAFE";
            const glowColor = RISK_COLORS[riskLevel] ?? RISK_COLORS.SAFE;
            el.select(".risk-glow").transition().duration(400).attr("stroke", glowColor).attr("stroke-width", 3);
          } else {
            el.transition().duration(400).attr("opacity", 0.15);
          }
        }
      });

      svg.selectAll("g > g:first-child line").transition().duration(400).attr("stroke", "rgba(255,255,255,0.03)");

      const hopIds = selectedPath.hops.map(h => h.nodeId);
      for (let i = 0; i < hopIds.length - 1; i++) {
        const riskLevel = selectedPath.hops[i + 1]?.riskLevel ?? "SAFE";
        const edgeColor = RISK_COLORS[riskLevel] ?? "#fbbf24";
        riskEdgeGroup.append("line")
          .attr("data-source", hopIds[i])
          .attr("data-target", hopIds[i + 1])
          .attr("stroke", edgeColor)
          .attr("stroke-width", 2.5)
          .attr("stroke-dasharray", "6 4")
          .attr("class", "risk-path-edge")
          .attr("opacity", 0)
          .transition().duration(400)
          .attr("opacity", 0.9);
      }
    } else {
      svg.selectAll(".kg-node").transition().duration(300).attr("opacity", 1);
      svg.selectAll("g > g:first-child line").transition().duration(300).attr("stroke", "rgba(255,255,255,0.08)");
    }
  }, [selectedPath, riskPathNodeIds, viewMode]);

  // ── Callbacks ─────────────────────────────────────────────────────────

  const toggleFilter = useCallback((type: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }, []);

  const handleZoomIn = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1.3);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 0.7);
  };

  const handleShowConnected = useCallback((node: GraphNode) => {
    setContextMenu(null);
    if (node.type === "resource" || node.type === "endpoint") handleExpand(node);
  }, [handleExpand]);

  const handleHideNode = useCallback((nodeId: string) => {
    setContextMenu(null);
    setHiddenNodes(prev => { const next = new Set(Array.from(prev)); next.add(nodeId); return next; });
    if (selectedNode?.id === nodeId) setSelectedNode(null);
    toast.success("Node hidden", { description: "Click \"Show All\" to restore hidden nodes." });
  }, [selectedNode]);

  const handleTogglePin = useCallback((node: GraphNode) => {
    setContextMenu(null);
    const isPinned = pinnedNodes.has(node.id);
    setPinnedNodes(prev => {
      const next = new Set(Array.from(prev));
      if (isPinned) next.delete(node.id); else next.add(node.id);
      return next;
    });
    const simNode = nodesRef.current.find(n => n.id === node.id);
    if (simNode) {
      if (isPinned) { simNode.fx = null; simNode.fy = null; }
      else { simNode.fx = simNode.x; simNode.fy = simNode.y; }
    }
    toast.success(isPinned ? "Node unpinned" : "Node pinned");
  }, [pinnedNodes]);

  const handleCopyNodeId = useCallback((nodeId: string) => {
    setContextMenu(null);
    navigator.clipboard.writeText(nodeId).then(() => {
      toast.success("Copied to clipboard", { description: nodeId });
    });
  }, []);

  const handleShowAll = useCallback(() => {
    setHiddenNodes(new Set());
    toast.success("All hidden nodes restored");
  }, []);

  // Graph Export Handlers
  const handleExportPNG = useCallback(() => {
    if (!svgRef.current) return;
    const svgEl = svgRef.current;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const canvas = document.createElement("canvas");
    const rect = svgEl.getBoundingClientRect();
    const scale = 2;
    canvas.width = rect.width * scale;
    canvas.height = rect.height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    const img = new window.Image();
    img.onload = () => {
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
      const link = document.createElement("a");
      link.download = `knowledge-graph-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Graph exported as PNG");
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
  }, []);

  const handleExportSVG = useCallback(() => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgRef.current);
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const link = document.createElement("a");
    link.download = `knowledge-graph-${Date.now()}.svg`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success("Graph exported as SVG");
  }, []);

  const handleAddToInvestigation = useCallback((node: GraphNode) => {
    setInvestigationDialog({ node });
  }, []);

  // Multi-select bulk action handlers
  const handleBulkHide = useCallback(() => {
    setHiddenNodes(prev => {
      const next = new Set(Array.from(prev));
      selectedNodes.forEach(id => next.add(id));
      return next;
    });
    if (selectedNode && selectedNodes.has(selectedNode.id)) setSelectedNode(null);
    toast.success(`${selectedNodes.size} node(s) hidden`);
    setSelectedNodes(new Set());
  }, [selectedNodes, selectedNode]);

  const handleBulkPin = useCallback(() => {
    const allPinned = Array.from(selectedNodes).every(id => pinnedNodes.has(id));
    setPinnedNodes(prev => {
      const next = new Set(Array.from(prev));
      selectedNodes.forEach(id => { if (allPinned) next.delete(id); else next.add(id); });
      return next;
    });
    nodesRef.current.forEach(n => {
      if (selectedNodes.has(n.id)) {
        if (allPinned) { n.fx = null; n.fy = null; }
        else { n.fx = n.x; n.fy = n.y; }
      }
    });
    toast.success(allPinned ? `${selectedNodes.size} node(s) unpinned` : `${selectedNodes.size} node(s) pinned`);
  }, [selectedNodes, pinnedNodes]);

  const handleBulkCopyIds = useCallback(() => {
    const ids = Array.from(selectedNodes).join("\n");
    navigator.clipboard.writeText(ids).then(() => {
      toast.success(`${selectedNodes.size} node ID(s) copied`);
    });
  }, [selectedNodes]);

  const handleBulkAddToInvestigation = useCallback(() => {
    const multiNode: GraphNode = {
      id: `multi-select-${Date.now()}`,
      type: "multi_select",
      label: `${selectedNodes.size} selected nodes`,
      properties: {
        nodeIds: Array.from(selectedNodes),
        nodeLabels: Array.from(selectedNodes).map(id => {
          const n = nodesRef.current.find(nd => nd.id === id) ?? filteredData.nodes.find((nd: any) => nd.id === id);
          return n ? n.label : id;
        }),
      },
    };
    setInvestigationDialog({ node: multiNode });
  }, [selectedNodes, filteredData]);

  const handleSelectAll = useCallback(() => {
    setSelectedNodes(new Set(filteredData.nodes.map((n: any) => n.id)));
  }, [filteredData]);

  const handleDeselectAll = useCallback(() => {
    setSelectedNodes(new Set());
  }, []);

  const toggleMultiSelect = useCallback(() => {
    setMultiSelectMode(prev => {
      if (prev) setSelectedNodes(new Set());
      return !prev;
    });
  }, []);

  const handleToggleSelect = useCallback((node: GraphNode) => {
    setContextMenu(null);
    if (!multiSelectMode) setMultiSelectMode(true);
    setSelectedNodes(prev => {
      const next = new Set(Array.from(prev));
      if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
      return next;
    });
  }, [multiSelectMode]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header Toolbar */}
      <GraphToolbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        layerFilter={layerFilter}
        setLayerFilter={setLayerFilter}
        riskFilter={riskFilter}
        setRiskFilter={setRiskFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults.data}
        onSearchSelect={handleSearchSelect}
        showRiskPaths={showRiskPaths}
        onToggleRiskPaths={() => { setShowRiskPaths(!showRiskPaths); if (showRiskPaths) setSelectedPathId(null); }}
        riskPathCount={riskPaths.length}
        multiSelectMode={multiSelectMode}
        onToggleMultiSelect={toggleMultiSelect}
        selectedNodeCount={selectedNodes.size}
        onExportPNG={handleExportPNG}
        onExportSVG={handleExportSVG}
        onRefresh={() => overviewQuery.refetch()}
        isLoading={isLoading}
        stats={statsQuery.data}
        expandedCount={expandedNodes.size}
      />

      {/* Content area */}
      {viewMode === "table" ? (
        <EndpointTableView />
      ) : (
        <div ref={containerRef} className="flex-1 relative bg-black/20 overflow-hidden">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                <p className="text-sm text-muted-foreground">Loading Knowledge Graph...</p>
              </div>
            </div>
          ) : filteredData.nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-center px-8">
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <Database className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-display font-bold text-foreground">No Graph Data</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  The Knowledge Graph is empty. Run the KG extraction pipeline from the Data Pipeline page to populate the 4-layer API ontology.
                </p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                  <Info className="w-3.5 h-3.5" />
                  <span>Navigate to Intelligence &rarr; Data Pipeline to start extraction</span>
                </div>
              </div>
            </div>
          ) : (
            <svg ref={svgRef} className="w-full h-full" />
          )}

          {/* Lasso rubber-band overlay */}
          {lassoRect && (
            <div
              className="lasso-overlay absolute pointer-events-none z-30 border-2 border-dashed border-cyan-400/60 bg-cyan-400/8 rounded-sm"
              data-x={lassoRect.x}
              data-y={lassoRect.y}
              data-w={lassoRect.w}
              data-h={lassoRect.h}
              style={{ left: lassoRect.x, top: lassoRect.y, width: lassoRect.w, height: lassoRect.h }}
            />
          )}

          {/* Zoom controls */}
          <div className="absolute top-4 left-4 flex flex-col gap-1 z-10">
            <button onClick={handleZoomIn} className="p-1.5 glass-panel rounded-lg border border-white/10 text-muted-foreground hover:text-foreground transition-colors" aria-label="Zoom in">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={handleZoomOut} className="p-1.5 glass-panel rounded-lg border border-white/10 text-muted-foreground hover:text-foreground transition-colors" aria-label="Zoom out">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (svgRef.current && zoomRef.current) {
                  d3.select(svgRef.current).transition().duration(500).call(zoomRef.current.transform, d3.zoomIdentity);
                }
              }}
              className="p-1.5 glass-panel rounded-lg border border-white/10 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Expansion hint */}
          {!selectedNode && !showRiskPaths && !multiSelectMode && filteredData.nodes.length > 0 && expandedNodes.size === 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 glass-panel rounded-lg border border-white/10 px-3 py-1.5 z-10 flex items-center gap-2">
              <MousePointerClick className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[10px] text-muted-foreground">Double-click a resource or endpoint to expand its neighbors</span>
            </div>
          )}

          {/* Multi-select floating toolbar */}
          {multiSelectMode && (
            <MultiSelectToolbar
              selectedCount={selectedNodes.size}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onBulkHide={handleBulkHide}
              onBulkPin={handleBulkPin}
              onBulkCopyIds={handleBulkCopyIds}
              onBulkAddToInvestigation={handleBulkAddToInvestigation}
              onExit={toggleMultiSelect}
            />
          )}

          {/* Stats overlay */}
          {statsQuery.data && !showRiskPaths && !selectedNode && (
            <StatsOverlay stats={statsQuery.data} />
          )}

          {/* Risk Path Panel */}
          {showRiskPaths && (
            <RiskPathPanel
              paths={riskPaths}
              selectedPathId={selectedPathId}
              onSelectPath={setSelectedPathId}
              isLoading={riskPathQuery.isLoading}
              onClose={() => { setShowRiskPaths(false); setSelectedPathId(null); }}
            />
          )}

          {/* Active risk path indicator */}
          {selectedPath && (
            <div className="absolute bottom-4 right-4 glass-panel rounded-xl border border-red-500/20 px-4 py-3 z-10 max-w-xs">
              <div className="flex items-center gap-2 mb-1">
                <Route className="w-3.5 h-3.5 text-red-400" />
                <p className="text-xs font-medium text-foreground">Active Risk Path</p>
                <button onClick={() => setSelectedPathId(null)} className="ml-auto p-0.5 rounded hover:bg-white/10 text-muted-foreground">
                  <EyeOff className="w-3 h-3" />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">{selectedPath.summary}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono" style={{ color: RISK_COLORS[selectedPath.riskLevel] ?? "#fbbf24" }}>
                  Score: {selectedPath.score}/100
                </span>
                <span className="text-[10px] text-muted-foreground">{selectedPath.hops.length} nodes</span>
              </div>
            </div>
          )}

          {/* Legend */}
          <GraphLegend activeFilters={activeFilters} onToggle={toggleFilter} />

          {/* Node detail panel */}
          {selectedNode && !showRiskPaths && (
            <NodeDetailPanel
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
              onExpand={handleExpand}
              isExpanded={expandedNodes.has(selectedNode.id)}
              expandLoading={expandLoading}
              onAddToInvestigation={handleAddToInvestigation}
            />
          )}

          {/* Context Menu */}
          {contextMenu && (
            <GraphContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              node={contextMenu.node}
              pinnedNodes={pinnedNodes}
              selectedNodes={selectedNodes}
              multiSelectMode={multiSelectMode}
              onShowConnected={handleShowConnected}
              onHideNode={handleHideNode}
              onTogglePin={handleTogglePin}
              onCopyNodeId={handleCopyNodeId}
              onAddToInvestigation={handleAddToInvestigation}
              onToggleSelect={handleToggleSelect}
            />
          )}

          {/* Hidden nodes indicator */}
          {hiddenNodes.size > 0 && (
            <div className="absolute bottom-4 right-4 glass-panel rounded-xl border border-orange-500/20 px-4 py-2.5 z-10 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <EyeOff className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-xs text-orange-300 font-mono">{hiddenNodes.size} hidden</span>
              </div>
              <button onClick={handleShowAll} className="text-xs text-purple-300 hover:text-purple-200 transition-colors font-medium">
                Show All
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add to Investigation Dialog */}
      {investigationDialog && (
        <AddToInvestigationDialog
          node={investigationDialog.node}
          onClose={() => setInvestigationDialog(null)}
        />
      )}
    </div>
  );
}
