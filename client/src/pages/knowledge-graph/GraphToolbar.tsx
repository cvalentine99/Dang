import {
  Network, List, Search, Route, SquareMousePointer, ImageIcon, Download, RefreshCw,
} from "lucide-react";

interface GraphToolbarProps {
  viewMode: "graph" | "table";
  setViewMode: (mode: "graph" | "table") => void;
  layerFilter: string;
  setLayerFilter: (v: string) => void;
  riskFilter: string | undefined;
  setRiskFilter: (v: string | undefined) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searchResults: any[] | undefined;
  onSearchSelect: (node: any) => void;
  showRiskPaths: boolean;
  onToggleRiskPaths: () => void;
  riskPathCount: number;
  multiSelectMode: boolean;
  onToggleMultiSelect: () => void;
  selectedNodeCount: number;
  onExportPNG: () => void;
  onExportSVG: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  stats: any;
  expandedCount: number;
}

export function GraphToolbar({
  viewMode,
  setViewMode,
  layerFilter,
  setLayerFilter,
  riskFilter,
  setRiskFilter,
  searchQuery,
  setSearchQuery,
  searchResults,
  onSearchSelect,
  showRiskPaths,
  onToggleRiskPaths,
  riskPathCount,
  multiSelectMode,
  onToggleMultiSelect,
  selectedNodeCount,
  onExportPNG,
  onExportSVG,
  onRefresh,
  isLoading,
  stats,
  expandedCount,
}: GraphToolbarProps): React.JSX.Element {
  return (
    <div className="flex-shrink-0 px-6 py-4 border-b border-white/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
            <Network className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold text-foreground">Knowledge Graph</h1>
            <p className="text-xs text-muted-foreground">
              4-Layer API Ontology
              {stats && ` \u2022 ${stats.endpoints} endpoints \u2022 ${stats.resources} resources`}
              {expandedCount > 0 && ` \u2022 ${expandedCount} expanded`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => setViewMode("graph")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                viewMode === "graph"
                  ? "bg-purple-500/15 text-purple-300 border-r border-white/10"
                  : "text-muted-foreground hover:bg-white/5 border-r border-white/10"
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              Graph
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                viewMode === "table"
                  ? "bg-purple-500/15 text-purple-300"
                  : "text-muted-foreground hover:bg-white/5"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Table
            </button>
          </div>

          {viewMode === "graph" && (
            <>
              {/* Layer filter */}
              <select
                value={layerFilter}
                onChange={e => setLayerFilter(e.target.value)}
                className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-foreground outline-none focus:border-purple-500/30"
              >
                <option value="all">All Layers</option>
                <option value="api_ontology">API Ontology</option>
                <option value="operational_semantics">Operational Semantics</option>
                <option value="schema_lineage">Schema Lineage</option>
                <option value="error_failure">Error & Failure</option>
              </select>

              {/* Risk filter */}
              <select
                value={riskFilter ?? ""}
                onChange={e => setRiskFilter(e.target.value || undefined)}
                className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-foreground outline-none focus:border-purple-500/30"
              >
                <option value="">All Risk</option>
                <option value="SAFE">SAFE</option>
                <option value="MUTATING">MUTATING</option>
                <option value="DESTRUCTIVE">DESTRUCTIVE</option>
              </select>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search KG..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/30 w-44"
                />
                {searchResults && searchResults.length > 0 && searchQuery.length >= 2 && (
                  <div className="absolute top-full mt-1 left-0 w-72 glass-panel rounded-lg border border-white/10 shadow-2xl z-30 max-h-60 overflow-y-auto">
                    {searchResults.slice(0, 10).map((node: any) => (
                      <button
                        key={node.id}
                        onClick={() => onSearchSelect(node)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors"
                      >
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: node._color ?? "#888" }} />
                        <span className="text-foreground truncate">{node.label}</span>
                        <span className="text-[10px] text-muted-foreground font-mono ml-auto">{node.type}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Risk Paths toggle */}
              <button
                onClick={onToggleRiskPaths}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  showRiskPaths
                    ? "border-red-500/30 bg-red-500/15 text-red-300"
                    : "border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <Route className="w-3.5 h-3.5" />
                Risk Paths
                {riskPathCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono bg-red-500/20 text-red-300">
                    {riskPathCount}
                  </span>
                )}
              </button>

              {/* Multi-select toggle */}
              <button
                onClick={onToggleMultiSelect}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  multiSelectMode
                    ? "border-cyan-500/30 bg-cyan-500/15 text-cyan-300"
                    : "border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}
                title="Toggle multi-select mode (or hold Shift+click)"
              >
                <SquareMousePointer className="w-3.5 h-3.5" />
                Select
                {selectedNodeCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono bg-cyan-500/20 text-cyan-300">
                    {selectedNodeCount}
                  </span>
                )}
              </button>
            </>
          )}

          {/* Export */}
          {viewMode === "graph" && (
            <div className="flex items-center rounded-lg border border-white/10 overflow-hidden">
              <button
                onClick={onExportPNG}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors border-r border-white/10"
                title="Export as PNG"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                PNG
              </button>
              <button
                onClick={onExportSVG}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
                title="Export as SVG"
              >
                <Download className="w-3.5 h-3.5" />
                SVG
              </button>
            </div>
          )}

          {/* Refresh */}
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-lg border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            aria-label="Refresh knowledge graph"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
