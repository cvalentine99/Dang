/**
 * ExportButton — Glass-morphism dropdown for CSV/JSON data export.
 * Themed to Amethyst Nexus. Supports both CSV and JSON formats.
 */
import { useState, useRef, useEffect } from "react";
import { Download, FileSpreadsheet, FileJson, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportCSV, exportJSON } from "@/lib/exportUtils";
import { toast } from "sonner";

interface ExportButtonProps {
  /** Function that returns the data to export (called on click, allows lazy evaluation) */
  getData: () => Array<Record<string, unknown>>;
  /** Base name for the exported file (e.g., "alerts", "vulnerabilities") */
  baseName: string;
  /** Optional column definitions for CSV export */
  columns?: { key: string; label: string }[];
  /** Optional context string appended to filename (e.g., "agent-001", "critical") */
  context?: string;
  /** Label shown on the button */
  label?: string;
  /** Compact mode — icon only */
  compact?: boolean;
  /** Disabled state */
  disabled?: boolean;
}

export function ExportButton({
  getData,
  baseName,
  columns,
  context,
  label = "Export",
  compact = false,
  disabled = false,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleExport = (format: "csv" | "json") => {
    setExporting(true);
    try {
      const data = getData();
      if (!data || data.length === 0) {
        toast.error("No data to export");
        return;
      }
      if (format === "csv") {
        exportCSV(data, baseName, { columns, context });
      } else {
        exportJSON(data, baseName, context);
      }
      toast.success(`Exported ${data.length} rows as ${format.toUpperCase()}`);
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setExporting(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        disabled={disabled || exporting}
        className={`
          bg-transparent border-glass-border hover:bg-primary/10 hover:border-primary/40
          text-muted-foreground hover:text-foreground transition-all
          ${compact ? "h-7 w-7 p-0" : "h-8 gap-1.5 px-3"}
        `}
      >
        {exporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {!compact && (
          <>
            <span className="text-xs">{label}</span>
            <ChevronDown className="h-3 w-3" />
          </>
        )}
      </Button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 min-w-[160px]
            glass-panel border border-glass-border rounded-lg shadow-xl
            backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <button
            onClick={() => handleExport("csv")}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-foreground/80
              hover:bg-primary/10 hover:text-foreground transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-threat-low" />
            <div className="text-left">
              <div className="font-medium">Export CSV</div>
              <div className="text-[10px] text-muted-foreground">Spreadsheet-compatible</div>
            </div>
          </button>
          <div className="h-px bg-glass-border mx-2" />
          <button
            onClick={() => handleExport("json")}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs text-foreground/80
              hover:bg-primary/10 hover:text-foreground transition-colors"
          >
            <FileJson className="h-3.5 w-3.5 text-primary" />
            <div className="text-left">
              <div className="font-medium">Export JSON</div>
              <div className="text-[10px] text-muted-foreground">Raw structured data</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
