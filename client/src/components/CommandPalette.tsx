/**
 * CommandPalette — Cmd+K / Ctrl+K global search overlay.
 *
 * Features:
 * - Built on shadcn/ui Command (cmdk) for accessible fuzzy search
 * - Keyboard navigation (Arrow Up/Down, Enter, Escape)
 * - Groups results by sidebar section
 * - Keyword-enhanced search (e.g. "cve" finds Vulnerabilities)
 * - Obsidian gold theme styling with keyboard hints footer
 */
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Activity,
  AlertTriangle,
  FileSearch,
  LayoutDashboard,
  ShieldCheck,
  StickyNote,
  Target,
  Bug,
  Server,
  Monitor,
  Crosshair,
  Layers,
  BookOpen,
  Radar,
  HeartPulse,
  UserCog,
  Brain,
  Network,
  FolderSearch,
  Database,
  Settings,
  Gauge,
  ScanSearch,
  Inbox,
  Zap,
  Workflow,
  Lightbulb,
  ShieldAlert,
  BarChart3,
  GitCompare,
  Package,
  Lock,
  FolderOpen,
  Cpu,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  Command,
} from "lucide-react";
import { useCallback, useMemo } from "react";
import { useLocation } from "wouter";

type CmdItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  group: string;
  keywords?: string[];
};

const commandItems: CmdItem[] = [
  { icon: LayoutDashboard, label: "SOC Console", path: "/", group: "Operations", keywords: ["dashboard", "home", "overview"] },
  { icon: Activity, label: "Fleet Command", path: "/agents", group: "Operations", keywords: ["agents", "fleet", "endpoints"] },
  { icon: Radar, label: "Threat Intel", path: "/threat-intel", group: "Operations", keywords: ["otx", "ioc", "indicators"] },
  { icon: Layers, label: "SIEM Events", path: "/siem", group: "Detection", keywords: ["logs", "events", "search"] },
  { icon: AlertTriangle, label: "Alerts Timeline", path: "/alerts", group: "Detection", keywords: ["alerts", "warnings", "notifications"] },
  { icon: Bug, label: "Vulnerabilities", path: "/vulnerabilities", group: "Detection", keywords: ["cve", "vulnerabilities", "patches"] },
  { icon: Target, label: "MITRE ATT&CK", path: "/mitre", group: "Detection", keywords: ["mitre", "tactics", "techniques", "attack"] },
  { icon: Crosshair, label: "Threat Hunting", path: "/hunting", group: "Detection", keywords: ["hunt", "search", "investigate"] },
  { icon: BookOpen, label: "Ruleset Explorer", path: "/rules", group: "Detection", keywords: ["rules", "decoders", "signatures"] },
  { icon: ShieldCheck, label: "Compliance", path: "/compliance", group: "Posture", keywords: ["pci", "gdpr", "hipaa", "nist", "compliance"] },
  { icon: FileSearch, label: "File Integrity", path: "/fim", group: "Posture", keywords: ["fim", "files", "integrity", "changes"] },
  { icon: Monitor, label: "IT Hygiene", path: "/hygiene", group: "Posture", keywords: ["hygiene", "health", "os", "packages"] },
  { icon: Package, label: "Fleet Inventory", path: "/fleet-inventory", group: "Posture", keywords: ["inventory", "packages", "software"] },
  { icon: GitCompare, label: "Drift Analytics", path: "/drift-analytics", group: "Posture", keywords: ["drift", "anomaly", "baseline", "deviation"] },
  { icon: Server, label: "Cluster Health", path: "/cluster", group: "System", keywords: ["cluster", "nodes", "wazuh", "health"] },
  { icon: HeartPulse, label: "System Status", path: "/status", group: "System", keywords: ["status", "uptime", "system"] },
  { icon: Lock, label: "Security Explorer", path: "/security", group: "System", keywords: ["security", "hardening", "sca"] },
  { icon: FolderOpen, label: "Group Management", path: "/groups", group: "System", keywords: ["groups", "agents", "management"] },
  { icon: Brain, label: "Security Analyst", path: "/analyst", group: "Intelligence", keywords: ["ai", "analyst", "chat", "investigate"] },
  { icon: Network, label: "Knowledge Graph", path: "/graph", group: "Intelligence", keywords: ["graph", "knowledge", "relationships"] },
  { icon: FolderSearch, label: "Investigations", path: "/investigations", group: "Intelligence", keywords: ["cases", "investigations", "incidents"] },
  { icon: Database, label: "Data Pipeline", path: "/pipeline", group: "Intelligence", keywords: ["pipeline", "data", "processing"] },
  { icon: Inbox, label: "Alert Queue", path: "/alert-queue", group: "Intelligence", keywords: ["queue", "triage", "pending"] },
  { icon: Zap, label: "Auto-Queue Rules", path: "/auto-queue-rules", group: "Intelligence", keywords: ["automation", "rules", "auto"] },
  { icon: Workflow, label: "Triage Pipeline", path: "/triage", group: "Intelligence", keywords: ["triage", "workflow", "pipeline"] },
  { icon: Lightbulb, label: "Living Cases", path: "/living-cases", group: "Intelligence", keywords: ["cases", "living", "active"] },
  { icon: ShieldAlert, label: "Response Actions", path: "/response-actions", group: "Intelligence", keywords: ["response", "actions", "remediation"] },
  { icon: ScanSearch, label: "Pipeline Inspector", path: "/pipeline-inspector", group: "Intelligence", keywords: ["inspector", "debug", "pipeline"] },
  { icon: BarChart3, label: "Feedback Analytics", path: "/feedback-analytics", group: "Intelligence", keywords: ["feedback", "analytics", "quality"] },
  { icon: Gauge, label: "Token Usage", path: "/admin/token-usage", group: "Admin", keywords: ["tokens", "usage", "cost", "llm"] },
  { icon: UserCog, label: "User Management", path: "/admin/users", group: "Admin", keywords: ["users", "accounts", "permissions"] },
  { icon: Settings, label: "Connection Settings", path: "/admin/settings", group: "Admin", keywords: ["settings", "config", "wazuh", "connection"] },
  { icon: ShieldAlert, label: "Access Audit", path: "/admin/audit", group: "Admin", keywords: ["audit", "access", "logs"] },
  { icon: Layers, label: "Broker Coverage", path: "/admin/broker-coverage", group: "Admin", keywords: ["broker", "coverage", "mapping"] },
  { icon: Cpu, label: "DGX Health", path: "/admin/dgx-health", group: "Admin", keywords: ["dgx", "gpu", "nvidia", "hardware"] },
  { icon: Zap, label: "Param Playground", path: "/admin/broker-playground", group: "Admin", keywords: ["playground", "params", "test"] },
  { icon: StickyNote, label: "Analyst Notes", path: "/notes", group: "Tools", keywords: ["notes", "notebook", "write"] },
];

// Group items by their group name, preserving order
const groupedItems = (() => {
  const groups: { name: string; items: CmdItem[] }[] = [];
  const seen = new Set<string>();
  for (const item of commandItems) {
    if (!seen.has(item.group)) {
      seen.add(item.group);
      groups.push({ name: item.group, items: [] });
    }
    groups.find(g => g.name === item.group)!.items.push(item);
  }
  return groups;
})();

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [, navigate] = useLocation();

  const handleSelect = useCallback(
    (path: string) => {
      onOpenChange(false);
      navigate(path);
    },
    [navigate, onOpenChange]
  );

  // Detect Mac for showing correct modifier key
  const isMac = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /Mac|iPod|iPhone|iPad/.test(navigator.platform),
    []
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command Palette"
      description="Search pages, features, and tools..."
      showCloseButton={false}
      className="!max-w-xl border-white/10 !p-0"
    >
      <CommandInput placeholder="Search pages, tools, settings..." />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>
          <div className="flex flex-col items-center gap-1 py-4">
            <p className="text-sm text-muted-foreground">No results found</p>
            <p className="text-xs text-muted-foreground/60">Try a different search term</p>
          </div>
        </CommandEmpty>
        {groupedItems.map((group) => (
          <CommandGroup key={group.name} heading={group.name}>
            {group.items.map((item) => (
              <CommandItem
                key={item.path}
                value={`${item.label} ${item.group} ${(item.keywords ?? []).join(" ")}`}
                onSelect={() => handleSelect(item.path)}
                className="gap-3"
              >
                <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">{item.label}</span>
                <CommandShortcut className="text-[10px] font-mono text-muted-foreground/40">
                  {item.path}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>

      {/* Footer with keyboard hints */}
      <div className="flex items-center gap-4 border-t border-white/8 px-3 py-2">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
          <ArrowUp className="h-3 w-3" />
          <ArrowDown className="h-3 w-3" />
          <span>Navigate</span>
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
          <CornerDownLeft className="h-3 w-3" />
          <span>Open</span>
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
          <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[9px] font-mono">
            ESC
          </kbd>
          <span>Close</span>
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/40">
          {isMac ? (
            <Command className="h-3 w-3" />
          ) : (
            <span className="font-mono">Ctrl+</span>
          )}
          <span className="font-mono">K</span>
        </span>
      </div>
    </CommandDialog>
  );
}
