import { NODE_CONFIG, LAYER_COLORS } from "./types";

interface GraphLegendProps {
  activeFilters: Set<string>;
  onToggle: (type: string) => void;
}

const LAYERS = [
  { name: "API Ontology", types: ["resource", "endpoint", "parameter", "response", "auth_method"] },
  { name: "Operational Semantics", types: ["use_case"] },
  { name: "Schema Lineage", types: ["index", "field"] },
  { name: "Error & Failure", types: ["error_pattern"] },
];

export function GraphLegend({ activeFilters, onToggle }: GraphLegendProps): React.JSX.Element {
  return (
    <div className="absolute bottom-4 left-4 glass-panel rounded-xl border border-white/10 px-3 py-2 z-10 max-w-xs">
      <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">KG Layers</p>
      <div className="space-y-1.5">
        {LAYERS.map(layer => (
          <div key={layer.name}>
            <p className="text-[9px] font-mono mb-0.5" style={{ color: LAYER_COLORS[layer.name] }}>{layer.name}</p>
            <div className="flex flex-wrap gap-1">
              {layer.types.map(type => {
                const config = NODE_CONFIG[type];
                const active = activeFilters.has(type);
                return (
                  <button
                    key={type}
                    onClick={() => onToggle(type)}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono transition-all border ${
                      active ? "border-white/20 bg-white/5 text-foreground" : "border-transparent bg-white/[0.02] text-muted-foreground opacity-50"
                    }`}
                  >
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active ? config.color : `${config.color}40` }} />
                    {type.replace("_", " ")}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
