# Component Interface Reference

Use these EXACT interfaces when wiring frontend pages. Do NOT invent props.

## StatCard
```ts
interface StatCardProps {
  label: string;           // NOT "title"
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  colorClass?: string;     // NOT "color" — use "text-green-400" etc.
  className?: string;
}
// NO onClick, NO isLoading, NO variant props
```

## ExportButton
```ts
interface ExportButtonProps {
  getData: () => Array<Record<string, unknown>>;  // NOT "data" — it's a function
  baseName: string;                                // NOT "filename"
  columns?: { key: string; label: string }[];
  context?: string;
  label?: string;
  compact?: boolean;
  disabled?: boolean;
}
```

## WazuhGuard
```ts
interface WazuhGuardProps {
  children: ReactNode;
}
// NO statusQ prop — it fetches its own status internally
// Just wrap: <WazuhGuard>{children}</WazuhGuard>
```

## SavedSearchPanel
```ts
interface SavedSearchPanelProps {
  searchType: SavedSearchType;  // REQUIRED
  label: string;                // REQUIRED
  getCurrentFilters: () => Record<string, unknown>;  // REQUIRED
  onLoadSearch: (filters: Record<string, unknown>) => void;  // REQUIRED
  filterSummary?: { label: string; value: string }[];
}
// ALL 4 required props must be provided — never use <SavedSearchPanel /> bare
```

## ThreatBadge
```ts
type ThreatLevel = "critical" | "high" | "medium" | "low" | "info" | "safe";
interface ThreatBadgeProps {
  level: ThreatLevel;   // NOT "text"/"isOk" — use level enum
  className?: string;
  showDot?: boolean;
}
```

## BrokerWarnings
```ts
interface BrokerWarningsProps {
  data: unknown;       // Single raw response object
  context?: string;
}
// For multiple queries: wrap each separately or pass array items individually
```

## PageHeader
```ts
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
  children?: ReactNode;
}
```

## RawJsonViewer
```ts
interface RawJsonViewerProps {
  data: unknown;
  title?: string;
}
```

## AddNoteDialog
```ts
interface AddNoteDialogProps {
  entityType: EntityType;  // "agent" | "alert" | "vulnerability" | etc.
  entityId?: string;
  defaultTitle?: string;
  defaultSeverity?: Severity;
  compact?: boolean;
  triggerLabel?: string;
  onCreated?: () => void;
}
```

## Key Patterns

### Connection check (every page does this internally or via WazuhGuard)
```ts
const statusQ = trpc.wazuh.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
const isConnected = statusQ.data?.configured === true && statusQ.data?.data != null;
```

### Data extraction
```ts
function extractItems(raw: unknown): { items: Array<Record<string, unknown>>; total: number } {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const items = (d?.affected_items as Array<Record<string, unknown>>) ?? [];
  const total = Number(d?.total_affected_items ?? items.length);
  return { items, total };
}
```

### Conditional params (spread pattern)
```ts
...(search ? { search } : {})
...(sort ? { sort } : {})
...(statusFilter !== "all" ? { status: statusFilter } : {})
```
