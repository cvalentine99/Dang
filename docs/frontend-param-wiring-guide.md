# Frontend Parameter Wiring — Implementation Guide

**Date:** 2026-03-10
**Audience:** Frontend developer implementing remediation cleanup
**Prerequisite:** Backend broker-wiring must be completed first (see `remediation-cleanup.md`)
**Scope:** 16 frontend components across 7 page files, wiring 175+ parameters

---

## Table of Contents

1. [Architecture & Conventions](#1-architecture--conventions)
2. [Available Building Blocks](#2-available-building-blocks)
3. [Implementation 1: SecurityExplorer.tsx](#3-implementation-1-securityexplorertsx)
4. [Implementation 2: FleetInventory.tsx](#4-implementation-2-fleetinventorytsx)
5. [Implementation 3: ITHygiene.tsx](#5-implementation-3-ithygienetsx)
6. [Implementation 4: ClusterHealth.tsx](#6-implementation-4-clusterhealthtsx)
7. [Implementation 5: Status.tsx](#7-implementation-5-statustsx)
8. [Implementation 6: AgentHealth.tsx](#8-implementation-6-agenthealthtsx)
9. [Implementation 7: GroupManagement.tsx](#9-implementation-7-groupmanagementtsx)
10. [Shared Utilities to Create](#10-shared-utilities-to-create)
11. [Testing Checklist](#11-testing-checklist)
12. [Appendix: Full Param Reference](#12-appendix-full-param-reference)

---

## 1. Architecture & Conventions

### How This Codebase Works

Every page follows the same pattern:

```
Page Component
  └─ WazuhGuard (connection gate)
       └─ PageHeader (title + refresh)
       └─ StatCard grid (KPIs)
       └─ GlassPanel (content panels)
            └─ tRPC hook → extractItems() → table/chart
```

**tRPC query pattern** (used everywhere, do not deviate):
```typescript
const myQuery = trpc.wazuh.procedureName.useQuery(
  inputParams,                    // Object with query params, or undefined
  {
    retry: 1,
    staleTime: 30_000,           // 15s-60s depending on data freshness needs
    enabled: isConnected,         // && tab === "myTab" for lazy-loaded tabs
  }
);
```

**Connection guard** (present in every page, do not change):
```typescript
const statusQ = trpc.wazuh.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
const isConnected = statusQ.data?.configured === true && statusQ.data?.data != null;
```

**Data extraction** (standard Wazuh response format):
```typescript
function extractItems(raw: unknown): { items: Array<Record<string, unknown>>; total: number } {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const items = (d?.affected_items as Array<Record<string, unknown>>) ?? [];
  const total = Number(d?.total_affected_items ?? items.length);
  return { items, total };
}
```

### Conventions to Follow

1. **0-indexed pages** in AgentHealth, GroupManagement, ITHygiene → `offset: page * pageSize`
2. **1-indexed pages** in FleetInventory, ClusterHealth node logs → `offset: (page - 1) * pageSize`
3. **Conditional params** always use spread: `...(search ? { search } : {})`
4. **Page resets** — always `setPage(0)` (or `1`) when search/filter/tab changes
5. **Debounce** text inputs that trigger API calls (300ms) — see AgentHealth's `useDebounced`
6. **staleTime** — use 15_000 for rapidly changing data (logs), 30_000 for moderate, 60_000 for stable
7. **enabled gating** — only fetch when tab is active: `enabled: isConnected && tab === "myTab"`
8. **Empty strings** — never send empty strings, convert to undefined: `search || undefined`
9. **Table styling** — `text-xs` or `text-[11px]`, `py-1.5 px-2`, `hover:bg-secondary/20`
10. **Icons** — import from `lucide-react`, use `h-4 w-4` or `h-3.5 w-3.5` sizing

### File Locations

| File | Path | Lines |
|---|---|---|
| SecurityExplorer | `client/src/pages/SecurityExplorer.tsx` | ~705 |
| FleetInventory | `client/src/pages/FleetInventory.tsx` | ~428 |
| ITHygiene | `client/src/pages/ITHygiene.tsx` | ~502 |
| ClusterHealth | `client/src/pages/ClusterHealth.tsx` | ~1013 |
| Status | `client/src/pages/Status.tsx` | ~991 |
| AgentHealth | `client/src/pages/AgentHealth.tsx` | ~587 |
| GroupManagement | `client/src/pages/GroupManagement.tsx` | ~656 |
| UI Components | `client/src/components/ui/` | 53 components |
| Shared Components | `client/src/components/shared/` | 15+ components |
| tRPC Client | `client/src/lib/trpc.ts` | — |

---

## 2. Available Building Blocks

### Already in the codebase — use these, don't reinvent

| Component | Import | Notes |
|---|---|---|
| `Input` | `@/components/ui/input` | Text input with focus states |
| `Button` | `@/components/ui/button` | Variants: default, outline, ghost, destructive. Sizes: sm, default, lg, icon |
| `Select` | `@/components/ui/select` | Radix select with SelectTrigger, SelectContent, SelectItem |
| `Tabs` | `@/components/ui/tabs` | TabsList, TabsTrigger, TabsContent |
| `Table` | `@/components/ui/table` | Table, TableHeader, TableBody, TableRow, TableHead, TableCell |
| `Badge` | `@/components/ui/badge` | Variants: default, secondary, destructive, outline |
| `Calendar` | `@/components/ui/calendar` | React Day Picker — for date params |
| `Popover` | `@/components/ui/popover` | PopoverTrigger, PopoverContent — for date picker wrapper |
| `Checkbox` | `@/components/ui/checkbox` | For `distinct` toggle |
| `Switch` | `@/components/ui/switch` | For `raw` toggle |
| `Dialog` | `@/components/ui/dialog` | Modal dialogs |
| `Pagination` | `@/components/ui/pagination` | PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext |
| `GlassPanel` | `@/components/shared` | Glass morphism container |
| `StatCard` | `@/components/shared` | KPI display |
| `PageHeader` | `@/components/shared` | Title + subtitle + refresh |
| `TableSkeleton` | `@/components/shared` | Loading skeleton |
| `BrokerWarnings` | `@/components/shared` | Broker warning display |
| `RawJsonViewer` | `@/components/shared` | JSON inspector |
| `WazuhGuard` | `@/components/shared` | Connection gate |

### Icons commonly used (from `lucide-react`)

```typescript
import {
  Search, Filter, SortAsc, SortDesc, ArrowUpDown,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  X, Calendar, Layers, RefreshCw,
} from "lucide-react";
```

---

## 3. Implementation 1: SecurityExplorer.tsx

**Current state:** `securityRoles`, `securityPolicies`, `securityUsers` called with `undefined`. `securityActions` called with `{}`. Client-side search only (no API params). No pagination. No sort. All data dumped at once.

**Target state:** Server-side pagination, search, sort for roles/policies/users. Endpoint filter for actions.

### Step 3.1: Add State Variables

Find the existing state declarations (around line 152-153):

```typescript
// EXISTING:
const [activeTab, setActiveTab] = useState<TabKey>("rules");
const [search, setSearch] = useState("");
```

Add these new state variables immediately after:

```typescript
// NEW — Pagination state per tab
const [rolesPage, setRolesPage] = useState(0);
const [policiesPage, setPoliciesPage] = useState(0);
const [usersPage, setUsersPage] = useState(0);
const pageSize = 25;

// NEW — Sort state
const [rolesSort, setRolesSort] = useState("");
const [policiesSort, setPoliciesSort] = useState("");
const [usersSort, setUsersSort] = useState("");

// NEW — Server search (debounced)
const [serverSearch, setServerSearch] = useState("");
const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
const handleSearchChange = useCallback((value: string) => {
  setSearch(value);  // Keep existing client-side filter
  clearTimeout(searchTimer.current);
  searchTimer.current = setTimeout(() => {
    setServerSearch(value);
    setRolesPage(0);
    setPoliciesPage(0);
    setUsersPage(0);
  }, 300);
}, []);

// NEW — Actions endpoint filter
const [actionsEndpointFilter, setActionsEndpointFilter] = useState("");
```

### Step 3.2: Update tRPC Hooks

Find the existing query hooks (around lines 163-166). Replace them:

```typescript
// BEFORE:
const rolesQ = trpc.wazuh.securityRoles.useQuery(undefined, {
  retry: 1, staleTime: 60_000, enabled: isConnected,
});

// AFTER:
const rolesQ = trpc.wazuh.securityRoles.useQuery(
  {
    offset: rolesPage * pageSize,
    limit: pageSize,
    ...(serverSearch ? { search: serverSearch } : {}),
    ...(rolesSort ? { sort: rolesSort } : {}),
  },
  { retry: 1, staleTime: 60_000, enabled: isConnected }
);
```

```typescript
// BEFORE:
const usersQ = trpc.wazuh.securityUsers.useQuery(undefined, {
  retry: 1, staleTime: 60_000, enabled: isConnected,
});

// AFTER:
const usersQ = trpc.wazuh.securityUsers.useQuery(
  {
    offset: usersPage * pageSize,
    limit: pageSize,
    ...(serverSearch ? { search: serverSearch } : {}),
    ...(usersSort ? { sort: usersSort } : {}),
  },
  { retry: 1, staleTime: 60_000, enabled: isConnected }
);
```

```typescript
// BEFORE:
const policiesQ = trpc.wazuh.securityPolicies.useQuery(undefined, {
  retry: 1, staleTime: 60_000, enabled: isConnected,
});

// AFTER:
const policiesQ = trpc.wazuh.securityPolicies.useQuery(
  {
    offset: policiesPage * pageSize,
    limit: pageSize,
    ...(serverSearch ? { search: serverSearch } : {}),
    ...(policiesSort ? { sort: policiesSort } : {}),
  },
  { retry: 1, staleTime: 60_000, enabled: isConnected }
);
```

```typescript
// BEFORE:
const actionsQ = trpc.wazuh.securityActions.useQuery({}, {
  retry: 1, staleTime: 60_000, enabled: isConnected,
});

// AFTER:
const actionsQ = trpc.wazuh.securityActions.useQuery(
  {
    ...(actionsEndpointFilter ? { endpoint: actionsEndpointFilter } : {}),
  },
  { retry: 1, staleTime: 60_000, enabled: isConnected }
);
```

### Step 3.3: Update Search Input

Find the existing search input (around line 283). Update the `onChange` handler:

```typescript
// BEFORE:
onChange={(e) => setSearch(e.target.value)}

// AFTER:
onChange={(e) => handleSearchChange(e.target.value)}
```

### Step 3.4: Add Sort Controls to Table Headers

The existing tables use plain `<th>` elements. Add sort toggle functionality.

**Create this helper component** at the top of the file (after imports, before the main component):

```typescript
function SortableHeader({
  label,
  field,
  currentSort,
  onSort,
}: {
  label: string;
  field: string;
  currentSort: string;
  onSort: (sort: string) => void;
}) {
  const isActive = currentSort.replace(/^[+-]/, "") === field;
  const isAsc = currentSort === `+${field}`;

  const handleClick = () => {
    if (!isActive) {
      onSort(`+${field}`);
    } else if (isAsc) {
      onSort(`-${field}`);
    } else {
      onSort("");  // Clear sort
    }
  };

  return (
    <th
      className="text-left py-2 px-3 text-muted-foreground font-medium whitespace-nowrap cursor-pointer hover:text-foreground transition-colors select-none"
      onClick={handleClick}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          isAsc ? (
            <SortAsc className="h-3 w-3 text-primary" />
          ) : (
            <SortDesc className="h-3 w-3 text-primary" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </th>
  );
}
```

**Add import** at the top of the file:
```typescript
import { SortAsc, SortDesc, ArrowUpDown } from "lucide-react";
```

### Step 3.5: Update the Roles Table

Find the Roles tab table `<thead>` (around line 530-540). Replace the static `<th>` elements with sortable headers:

```typescript
// BEFORE (approximate):
<thead>
  <tr className="border-b border-border/30">
    <th className="text-left py-2 px-3 text-muted-foreground font-medium">ID</th>
    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Name</th>
    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Policies</th>
    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Rules</th>
  </tr>
</thead>

// AFTER:
<thead>
  <tr className="border-b border-border/30">
    <SortableHeader label="ID" field="id" currentSort={rolesSort} onSort={(s) => { setRolesSort(s); setRolesPage(0); }} />
    <SortableHeader label="Name" field="name" currentSort={rolesSort} onSort={(s) => { setRolesSort(s); setRolesPage(0); }} />
    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Policies</th>
    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Rules</th>
  </tr>
</thead>
```

Apply the same pattern to **Users** and **Policies** tab tables, using `usersSort`/`setUsersSort` and `policiesSort`/`setPoliciesSort` respectively.

### Step 3.6: Add Pagination Controls

After each table in the roles/policies/users tabs, add pagination. Find the closing `</div>` of the table's overflow wrapper and add:

```typescript
{/* After the </table> closing tag, inside the overflow-x-auto div */}
{(() => {
  const { total } = extractItems(rolesQ.data);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/10">
      <span className="text-xs text-muted-foreground">
        {total.toLocaleString()} total roles
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setRolesPage(p => Math.max(0, p - 1))}
          disabled={rolesPage === 0}
          className="p-1 rounded hover:bg-secondary/30 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted-foreground">
          Page {rolesPage + 1} of {totalPages}
        </span>
        <button
          onClick={() => setRolesPage(p => Math.min(totalPages - 1, p + 1))}
          disabled={rolesPage >= totalPages - 1}
          className="p-1 rounded hover:bg-secondary/30 disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
})()}
```

Repeat for policies (using `policiesPage`/`setPoliciesPage`) and users (using `usersPage`/`setUsersPage`).

### Step 3.7: Add Actions Endpoint Filter

Find the Actions tab content (around line 450). Add a filter dropdown above the table:

```typescript
{/* Inside the Actions TabsContent, before the table */}
<div className="flex items-center gap-2 mb-3">
  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
  <Input
    placeholder="Filter by endpoint..."
    value={actionsEndpointFilter}
    onChange={(e) => setActionsEndpointFilter(e.target.value)}
    className="h-7 w-48 text-xs bg-secondary/20 border-border/30"
  />
  {actionsEndpointFilter && (
    <button onClick={() => setActionsEndpointFilter("")} className="text-muted-foreground hover:text-foreground">
      <X className="h-3.5 w-3.5" />
    </button>
  )}
</div>
```

Add `Filter` and `X` to the lucide-react import.

### Step 3.8: Verification

After implementation, verify:

- [ ] Roles tab: Change pages → different data loads. Sort by ID/Name → column header shows arrow, data reorders. Search → results filter server-side, page resets to 1.
- [ ] Policies tab: Same behavior as roles.
- [ ] Users tab: Same behavior as roles.
- [ ] Actions tab: Type in endpoint filter → results update. Clear → all results shown.
- [ ] Existing tabs (rules, resources, allPolicies, currentUser) still work unchanged.
- [ ] No TypeScript errors (`tsc --noEmit`).

---

## 4. Implementation 2: FleetInventory.tsx

**Current state:** `qInput()` helper passes `limit`, `offset`, `q` only. No sort. No `distinct`. No endpoint-specific filters.

**Target state:** Add sort support to `qInput()`. Add distinct toggle. Add hotfix filter for hotfixes tab.

### Step 4.1: Add State Variables

Find existing state (around lines 138-143):

```typescript
// EXISTING:
const [search, setSearch] = useState("");
const [pages, setPages] = useState<Record<TabKey, number>>({...});
const pageSize = 50;
```

Add after:

```typescript
// NEW — Sort state per tab
const [sorts, setSorts] = useState<Record<TabKey, string>>({
  packages: "", processes: "", ports: "", os: "", hardware: "",
  hotfixes: "", netaddr: "", netiface: "", netproto: "",
});

// NEW — Distinct toggle
const [distinct, setDistinct] = useState(false);

// NEW — Hotfix filter
const [hotfixFilter, setHotfixFilter] = useState("");
```

### Step 4.2: Update qInput() Helper

Find the existing `qInput` (around line 157):

```typescript
// BEFORE:
const qInput = useCallback((tab: TabKey) => ({
  limit: pageSize,
  offset: (pages[tab] - 1) * pageSize,
  ...(search ? { q: `name~${search}` } : {}),
}), [pages, search]);

// AFTER:
const qInput = useCallback((tab: TabKey) => ({
  limit: pageSize,
  offset: (pages[tab] - 1) * pageSize,
  ...(search ? { q: `name~${search}` } : {}),
  ...(sorts[tab] ? { sort: sorts[tab] } : {}),
  ...(distinct ? { distinct: true } : {}),
  ...(tab === "hotfixes" && hotfixFilter ? { hotfix: hotfixFilter } : {}),
}), [pages, search, sorts, distinct, hotfixFilter]);
```

### Step 4.3: Add Sort Handler

Add after `handlePageChange`:

```typescript
const handleSortChange = useCallback((tab: TabKey, sort: string) => {
  setSorts(prev => ({ ...prev, [tab]: sort }));
  setPages(prev => ({ ...prev, [tab]: 1 }));  // Reset to page 1 on sort change
}, []);
```

### Step 4.4: Update DataTable Component

Find the existing `DataTable` component (around line 106). Update the column headers to support sorting:

```typescript
// BEFORE:
function DataTable({ columns, rows, renderRow }: {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  renderRow: (item: Record<string, unknown>, idx: number) => React.ReactNode;
}) {

// AFTER:
function DataTable({ columns, rows, renderRow, sortableFields, currentSort, onSort }: {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  renderRow: (item: Record<string, unknown>, idx: number) => React.ReactNode;
  sortableFields?: Record<string, string>;  // column label → Wazuh field name
  currentSort?: string;
  onSort?: (sort: string) => void;
}) {
```

Update the `<thead>` inside DataTable:

```typescript
// BEFORE:
<thead>
  <tr className="border-b border-border/30">
    {columns.map((h) => (
      <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
    ))}
  </tr>
</thead>

// AFTER:
<thead>
  <tr className="border-b border-border/30">
    {columns.map((h) => {
      const sortField = sortableFields?.[h];
      if (sortField && onSort && currentSort !== undefined) {
        const isActive = currentSort.replace(/^[+-]/, "") === sortField;
        const isAsc = currentSort === `+${sortField}`;
        return (
          <th
            key={h}
            className="text-left py-2 px-3 text-muted-foreground font-medium whitespace-nowrap cursor-pointer hover:text-foreground transition-colors select-none"
            onClick={() => {
              if (!isActive) onSort(`+${sortField}`);
              else if (isAsc) onSort(`-${sortField}`);
              else onSort("");
            }}
          >
            <span className="inline-flex items-center gap-1">
              {h}
              {isActive ? (
                isAsc ? <SortAsc className="h-3 w-3 text-primary" /> : <SortDesc className="h-3 w-3 text-primary" />
              ) : (
                <ArrowUpDown className="h-3 w-3 opacity-30" />
              )}
            </span>
          </th>
        );
      }
      return (
        <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
      );
    })}
  </tr>
</thead>
```

Add the `SortAsc`, `SortDesc`, `ArrowUpDown` imports from `lucide-react`.

### Step 4.5: Define Sortable Fields per Tab

Add this constant after `TAB_META`:

```typescript
const TAB_SORT_FIELDS: Partial<Record<TabKey, Record<string, string>>> = {
  packages:  { "Name": "name", "Version": "version", "Vendor": "vendor", "Architecture": "architecture" },
  processes: { "Name": "name", "PID": "pid", "State": "state", "User": "euser" },
  ports:     { "Protocol": "protocol", "Local Port": "local.port", "State": "state", "PID": "pid" },
  os:        { "OS Name": "os.name", "Platform": "os.platform", "Hostname": "hostname" },
  hardware:  { "CPU Cores": "cpu.cores", "RAM (MB)": "ram.total" },
  hotfixes:  { "Hotfix ID": "hotfix", "Scan Time": "scan.time" },
  netaddr:   { "Interface": "iface", "Address": "address", "Protocol": "proto" },
  netiface:  { "Name": "name", "Type": "type", "State": "state", "MTU": "mtu" },
  netproto:  { "Interface": "iface", "Type": "type", "Gateway": "gateway" },
};
```

### Step 4.6: Update DataTable Calls

Find where `DataTable` is rendered (around line 408). Update each call:

```typescript
// BEFORE:
<DataTable
  columns={TAB_META[tab].columns}
  rows={items}
  renderRow={rowRenderers[tab]}
/>

// AFTER:
<DataTable
  columns={TAB_META[tab].columns}
  rows={items}
  renderRow={rowRenderers[tab]}
  sortableFields={TAB_SORT_FIELDS[tab]}
  currentSort={sorts[tab]}
  onSort={(s) => handleSortChange(tab, s)}
/>
```

### Step 4.7: Add Controls Bar

Find the search input area (around line 344). Add distinct toggle and hotfix filter after the search input:

```typescript
{/* After the existing search Input, add these controls */}
<div className="flex items-center gap-3 ml-auto">
  {/* Distinct toggle */}
  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
    <input
      type="checkbox"
      checked={distinct}
      onChange={(e) => {
        setDistinct(e.target.checked);
        setPages(prev => ({ ...prev, [activeTab]: 1 }));
      }}
      className="rounded border-border/30"
    />
    Distinct
  </label>

  {/* Hotfix filter (only on hotfixes tab) */}
  {activeTab === "hotfixes" && (
    <Input
      placeholder="Filter hotfix ID..."
      value={hotfixFilter}
      onChange={(e) => {
        setHotfixFilter(e.target.value);
        setPages(prev => ({ ...prev, hotfixes: 1 }));
      }}
      className="h-7 w-36 text-xs bg-secondary/20 border-border/30"
    />
  )}
</div>
```

### Step 4.8: Verification

- [ ] Click column headers → sort arrow appears, data reorders from server
- [ ] Click same header again → sort direction reverses
- [ ] Click third time → sort clears
- [ ] Toggle "Distinct" → data changes (unique values only)
- [ ] On Hotfixes tab: type a hotfix ID → results filter
- [ ] Pagination still works after sort/filter
- [ ] Search still works (resets page to 1)

---

## 5. Implementation 3: ITHygiene.tsx

**Current state:** Passes `agentId`, `limit`, `offset` to `agentBrowserExtensions`, `agentUsers`, `agentGroups2`. No sort, no search on these tabs (search only works for packages/processes).

**Target state:** Add search and sort for all tabs.

### Step 5.1: Add Sort State

Find existing state (around line 83-89). Add:

```typescript
// NEW — Sort state
const [sort, setSort] = useState("");
```

### Step 5.2: Update Query Hooks

Find the extensions, users, and groups queries (around lines 140-159). Add `sort` and `search`:

```typescript
// BEFORE (extensions example):
const extensionsQ = trpc.wazuh.agentBrowserExtensions.useQuery(
  { agentId, limit: pageSize, offset: page * pageSize },
  { retry: 1, staleTime: 60_000, enabled: isConnected && tab === "extensions" }
);

// AFTER:
const extensionsQ = trpc.wazuh.agentBrowserExtensions.useQuery(
  {
    agentId,
    limit: pageSize,
    offset: page * pageSize,
    ...(search ? { search } : {}),
    ...(sort ? { sort } : {}),
  },
  { retry: 1, staleTime: 60_000, enabled: isConnected && tab === "extensions" }
);
```

Apply the same pattern to `usersQ` and `groupsQ`.

Also update `hotfixesQ`, `servicesQ`, `portsQ` to pass search and sort if their backend supports it.

### Step 5.3: Reset Sort on Tab Change

Find the tab change handler (around line 432):

```typescript
// BEFORE:
onValueChange={(v) => { setTab(v as TabKey); setPage(0); setSearch(""); }}

// AFTER:
onValueChange={(v) => { setTab(v as TabKey); setPage(0); setSearch(""); setSort(""); }}
```

### Step 5.4: Update tabProps

Find `tabProps` (around line 323):

```typescript
// BEFORE:
const tabProps = { page, pageSize, onPageChange: setPage, agentId };

// AFTER:
const tabProps = { page, pageSize, onPageChange: setPage, agentId, sort, onSort: (s: string) => { setSort(s); setPage(0); } };
```

The child tab components will need to accept and use these new props for sortable column headers. Follow the same `SortableHeader` pattern from Section 3.4.

### Step 5.5: Verification

- [ ] Search input filters all tabs (not just packages/processes)
- [ ] Sort state resets when switching tabs
- [ ] Page resets to 0 when sort changes
- [ ] Extensions/Users/Groups tabs pass search and sort to API

---

## 6. Implementation 4: ClusterHealth.tsx

**Current state:** `clusterNodeLogs` passes `nodeId`, `limit`, `offset`, `search` but not `tag` or `level`. `clusterNodeConfiguration` is passthrough (nodeId only). `clusterNodeStats` is passthrough (nodeId only).

**Target state:** Add level dropdown and tag filter to node logs. Add section/field/raw to node config. Add date to node stats.

### Step 6.1: Node Logs — Add Level and Tag Filters

Find the `NodeDrillDown` component (around line 169). It already has `logSearch` state. Add:

```typescript
// EXISTING in NodeDrillDown:
const [logSearch, setLogSearch] = useState("");
const [logPage, setLogPage] = useState(1);
const logPageSize = 20;

// NEW — Add these after the existing state:
const [logLevel, setLogLevel] = useState("");
const [logTag, setLogTag] = useState("");
```

Find the `nodeLogsQ` hook (around line 189):

```typescript
// BEFORE:
const nodeLogsQ = trpc.wazuh.clusterNodeLogs.useQuery(
  { nodeId, limit: logPageSize, offset: (logPage - 1) * logPageSize, ...(logSearch ? { search: logSearch } : {}) },
  { retry: 1, staleTime: 15_000, enabled: isConnected }
);

// AFTER:
const nodeLogsQ = trpc.wazuh.clusterNodeLogs.useQuery(
  {
    nodeId,
    limit: logPageSize,
    offset: (logPage - 1) * logPageSize,
    ...(logSearch ? { search: logSearch } : {}),
    ...(logLevel ? { level: logLevel } : {}),
    ...(logTag ? { tag: logTag } : {}),
  },
  { retry: 1, staleTime: 15_000, enabled: isConnected }
);
```

Find the log search input area in NodeDrillDown. Add filter controls next to it:

```typescript
{/* Add after the existing search input */}
<select
  value={logLevel}
  onChange={(e) => { setLogLevel(e.target.value); setLogPage(1); }}
  className="h-7 text-[11px] bg-secondary/20 border border-border/30 rounded px-2 text-foreground"
>
  <option value="">All Levels</option>
  <option value="error">Error</option>
  <option value="warning">Warning</option>
  <option value="info">Info</option>
  <option value="debug">Debug</option>
</select>

<Input
  placeholder="Filter by tag..."
  value={logTag}
  onChange={(e) => { setLogTag(e.target.value); setLogPage(1); }}
  className="h-7 w-32 text-[11px] bg-secondary/20 border-border/30"
/>
{logTag && (
  <button onClick={() => { setLogTag(""); setLogPage(1); }} className="text-muted-foreground hover:text-foreground">
    <X className="h-3 w-3" />
  </button>
)}
```

### Step 6.2: Node Configuration — Add Section/Field/Raw

Find where `clusterNodeConfiguration` is queried in NodeDrillDown (around line 180):

Add state:
```typescript
const [cfgSection, setCfgSection] = useState("");
const [cfgField, setCfgField] = useState("");
const [cfgRaw, setCfgRaw] = useState(false);
```

Update the query:
```typescript
// BEFORE:
const nodeConfigQ = trpc.wazuh.clusterNodeConfiguration.useQuery(
  { nodeId },
  { retry: 1, staleTime: 60_000, enabled: isConnected }
);

// AFTER:
const nodeConfigQ = trpc.wazuh.clusterNodeConfiguration.useQuery(
  {
    nodeId,
    ...(cfgSection ? { section: cfgSection } : {}),
    ...(cfgField ? { field: cfgField } : {}),
    ...(cfgRaw ? { raw: true } : {}),
  },
  { retry: 1, staleTime: 60_000, enabled: isConnected }
);
```

Add controls above the config display (follow the same pattern as the manager config section selector already in the main component around line 872):

```typescript
<div className="flex items-center gap-2 mb-3">
  <select
    value={cfgSection}
    onChange={(e) => setCfgSection(e.target.value)}
    className="h-7 text-[11px] bg-secondary/20 border border-border/30 rounded px-2 text-foreground"
  >
    <option value="">All Sections</option>
    <option value="global">Global</option>
    <option value="alerts">Alerts</option>
    <option value="active-response">Active Response</option>
    <option value="command">Command</option>
    <option value="localfile">Local File</option>
    <option value="remote">Remote</option>
    <option value="rootcheck">Rootcheck</option>
    <option value="rules">Rules</option>
    <option value="syscheck">Syscheck</option>
    <option value="auth">Auth</option>
    <option value="cluster">Cluster</option>
    <option value="logging">Logging</option>
    <option value="integration">Integration</option>
    <option value="vulnerability-detector">Vulnerability Detector</option>
    <option value="wmodules">WModules</option>
  </select>

  <Input
    placeholder="Field name..."
    value={cfgField}
    onChange={(e) => setCfgField(e.target.value)}
    className="h-7 w-32 text-[11px] bg-secondary/20 border-border/30"
  />

  <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
    <input
      type="checkbox"
      checked={cfgRaw}
      onChange={(e) => setCfgRaw(e.target.checked)}
      className="rounded border-border/30"
    />
    Raw
  </label>
</div>
```

### Step 6.3: Node Stats — Add Date Picker

Find `clusterNodeStats` in NodeDrillDown (around line 212). Add date state and update the query:

```typescript
// NEW state:
const [statsDate, setStatsDate] = useState("");

// BEFORE:
const nodeStatsQ = trpc.wazuh.clusterNodeStats.useQuery(
  { nodeId },
  { retry: 1, staleTime: 30_000, enabled: isConnected }
);

// AFTER:
const nodeStatsQ = trpc.wazuh.clusterNodeStats.useQuery(
  {
    nodeId,
    ...(statsDate ? { date: statsDate } : {}),
  },
  { retry: 1, staleTime: 30_000, enabled: isConnected }
);
```

Add a date input near the stats display:

```typescript
<div className="flex items-center gap-2 mb-2">
  <span className="text-[11px] text-muted-foreground">Stats date:</span>
  <Input
    type="date"
    value={statsDate}
    onChange={(e) => setStatsDate(e.target.value)}
    className="h-7 w-36 text-[11px] bg-secondary/20 border-border/30"
  />
  {statsDate && (
    <button onClick={() => setStatsDate("")} className="text-muted-foreground hover:text-foreground">
      <X className="h-3 w-3" />
    </button>
  )}
</div>
```

### Step 6.4: Verification

- [ ] Node logs: Select "Error" level → only error logs shown. Type tag → filters by daemon tag. Both reset page to 1.
- [ ] Node configuration: Select section → filtered config. Type field → further filtered. Toggle Raw → raw config format.
- [ ] Node stats: Select date → stats for that date. Clear → current stats.
- [ ] Existing manager logs filters still work (they already have level/tag, around line 819).

---

## 7. Implementation 5: Status.tsx

**Current state:** `managerStats` called with `undefined`. `taskStatus` called with `{}`.

**Target state:** Add date picker to manager stats. Add pagination + filters to task status.

### Step 7.1: Manager Stats — Add Date Picker

Find `managerStats` query (around line 550):

Add state near other state declarations:
```typescript
const [statsDate, setStatsDate] = useState("");
```

Update the query:
```typescript
// BEFORE:
const managerStatsQ = trpc.wazuh.managerStats.useQuery(undefined, { staleTime: 60_000, retry: 1 });

// AFTER:
const managerStatsQ = trpc.wazuh.managerStats.useQuery(
  statsDate ? { date: statsDate } : undefined,
  { staleTime: 60_000, retry: 1 }
);
```

Find where manager stats are displayed and add a date input:
```typescript
<div className="flex items-center gap-2 mb-2">
  <span className="text-xs text-muted-foreground">Date:</span>
  <Input
    type="date"
    value={statsDate}
    onChange={(e) => setStatsDate(e.target.value)}
    className="h-7 w-36 text-xs bg-secondary/20 border-border/30"
  />
  {statsDate && (
    <button onClick={() => setStatsDate("")} className="text-muted-foreground hover:text-foreground">
      <X className="h-3 w-3" />
    </button>
  )}
</div>
```

### Step 7.2: Task Status — Add Pagination and Filters

Find `taskStatus` query (around line 572):

Add state:
```typescript
const [taskPage, setTaskPage] = useState(0);
const [taskStatus, setTaskStatusFilter] = useState("");
const [taskModule, setTaskModule] = useState("");
const [taskSearch, setTaskSearch] = useState("");
const taskPageSize = 25;
```

Update the query:
```typescript
// BEFORE:
const taskStatusQ = trpc.wazuh.taskStatus.useQuery({}, { staleTime: 60_000, retry: 1 });

// AFTER:
const taskStatusQ = trpc.wazuh.taskStatus.useQuery(
  {
    offset: taskPage * taskPageSize,
    limit: taskPageSize,
    ...(taskStatus ? { status: taskStatus } : {}),
    ...(taskModule ? { module: taskModule } : {}),
    ...(taskSearch ? { search: taskSearch } : {}),
  },
  { staleTime: 60_000, retry: 1 }
);
```

Find where task status is displayed (currently rendered as `<pre>` JSON). Replace with a proper table:

```typescript
{/* Replace the existing <pre> JSON dump with: */}
<GlassPanel>
  <div className="flex items-center gap-3 mb-3">
    <h3 className="text-sm font-medium text-foreground">Task Queue</h3>

    <Input
      placeholder="Search tasks..."
      value={taskSearch}
      onChange={(e) => { setTaskSearch(e.target.value); setTaskPage(0); }}
      className="h-7 w-40 text-xs bg-secondary/20 border-border/30"
    />

    <select
      value={taskStatus}
      onChange={(e) => { setTaskStatusFilter(e.target.value); setTaskPage(0); }}
      className="h-7 text-xs bg-secondary/20 border border-border/30 rounded px-2 text-foreground"
    >
      <option value="">All Statuses</option>
      <option value="In progress">In progress</option>
      <option value="Done">Done</option>
      <option value="Failed">Failed</option>
      <option value="Cancelled">Cancelled</option>
    </select>

    <select
      value={taskModule}
      onChange={(e) => { setTaskModule(e.target.value); setTaskPage(0); }}
      className="h-7 text-xs bg-secondary/20 border border-border/30 rounded px-2 text-foreground"
    >
      <option value="">All Modules</option>
      <option value="upgrade_module">Upgrade</option>
      <option value="api">API</option>
    </select>
  </div>

  <BrokerWarnings data={taskStatusQ.data} context="Task Status" />

  {taskStatusQ.isLoading ? (
    <TableSkeleton columns={6} rows={5} />
  ) : (() => {
    const { items, total } = extractItems(taskStatusQ.data);
    const totalPages = Math.max(1, Math.ceil(total / taskPageSize));
    return (
      <>
        {items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Layers className="h-6 w-6 mx-auto mb-2 opacity-40" />
            No tasks found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30">
                  {["Task ID", "Agent", "Command", "Module", "Status", "Create Time"].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((task, i) => (
                  <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                    <td className="py-1.5 px-3 font-mono text-primary">{String(task.task_id ?? "—")}</td>
                    <td className="py-1.5 px-3 font-mono text-muted-foreground">{String(task.agent_id ?? "—")}</td>
                    <td className="py-1.5 px-3 text-foreground">{String(task.command ?? "—")}</td>
                    <td className="py-1.5 px-3 text-muted-foreground">{String(task.module ?? "—")}</td>
                    <td className="py-1.5 px-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        String(task.status) === "Done" ? "bg-emerald-500/10 text-emerald-400" :
                        String(task.status) === "Failed" ? "bg-red-500/10 text-red-400" :
                        String(task.status) === "In progress" ? "bg-amber-500/10 text-amber-400" :
                        "bg-secondary/30 text-muted-foreground"
                      }`}>
                        {String(task.status ?? "—")}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-muted-foreground font-mono">{String(task.create_time ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/10">
            <span className="text-xs text-muted-foreground">{total} total tasks</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTaskPage(p => Math.max(0, p - 1))}
                disabled={taskPage === 0}
                className="p-1 rounded hover:bg-secondary/30 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-muted-foreground">Page {taskPage + 1} of {totalPages}</span>
              <button
                onClick={() => setTaskPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={taskPage >= totalPages - 1}
                className="p-1 rounded hover:bg-secondary/30 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </>
    );
  })()}
</GlassPanel>
```

### Step 7.3: Verification

- [ ] Manager stats: Select a date → stats change. Clear → current stats.
- [ ] Task status: Paginate through tasks. Filter by status → filtered results. Filter by module → filtered. Search → filtered. All reset page.
- [ ] Auto-refresh still works after adding filters.

---

## 8. Implementation 6: AgentHealth.tsx

**Current state:** `agentsUpgradeResult` called with `{}`. `agentsOutdated` called with `{limit: 1, offset: 0}` (count only). `agentsNoGroup` called with `{limit: 1, offset: 0}` (count only).

**Target state:** Add agents_list filter to upgrade results. These are count-only queries on AgentHealth — the full list views are in GroupManagement.tsx (see next section).

### Step 8.1: Upgrade Results — Add Agent Filter

Find `agentsUpgradeResult` query (around line 126). Add state and update:

```typescript
// NEW state (add near other state declarations):
const [upgradeAgentFilter, setUpgradeAgentFilter] = useState("");

// BEFORE:
const upgradeResultQ = trpc.wazuh.agentsUpgradeResult.useQuery(
  {},
  { retry: 1, staleTime: 60_000, enabled: isConnected }
);

// AFTER:
const upgradeResultQ = trpc.wazuh.agentsUpgradeResult.useQuery(
  {
    ...(upgradeAgentFilter ? { agents_list: upgradeAgentFilter } : {}),
  },
  { retry: 1, staleTime: 60_000, enabled: isConnected }
);
```

Add filter input near the upgrade results display:
```typescript
<Input
  placeholder="Filter by agent IDs (comma-separated)..."
  value={upgradeAgentFilter}
  onChange={(e) => setUpgradeAgentFilter(e.target.value)}
  className="h-7 w-64 text-xs bg-secondary/20 border-border/30"
/>
```

### Step 8.2: Verification

- [ ] Upgrade results: Type "001,002" in agent filter → only those agents' results shown.
- [ ] Clear filter → all results.
- [ ] Outdated/NoGroup counts still display correctly (these are count-only, no change needed here).

---

## 9. Implementation 7: GroupManagement.tsx

**Current state:** `agentsOutdated` and `agentsNoGroup` called with `{limit: 100, offset: page*100}` — pagination only, no search/sort. `agentsStatsDistinct` called with `{fields}` only — no pagination.

**Target state:** Add search and sort to outdated/noGroup. Add pagination to statsDistinct.

### Step 9.1: Add Sort State

Find existing state. Add:

```typescript
// NEW:
const [outdatedSort, setOutdatedSort] = useState("");
const [noGroupSort, setNoGroupSort] = useState("");
const [distinctPage, setDistinctPage] = useState(0);
const [outdatedSearch, setOutdatedSearch] = useState("");
const [noGroupSearch, setNoGroupSearch] = useState("");
```

### Step 9.2: Update Queries

```typescript
// BEFORE (outdated):
const outdatedQ = trpc.wazuh.agentsOutdated.useQuery(
  { limit: 100, offset: outdatedPage * 100 },
  { retry: 1, staleTime: 60_000, enabled: isConnected }
);

// AFTER:
const outdatedQ = trpc.wazuh.agentsOutdated.useQuery(
  {
    limit: 100,
    offset: outdatedPage * 100,
    ...(outdatedSort ? { sort: outdatedSort } : {}),
    ...(outdatedSearch ? { search: outdatedSearch } : {}),
  },
  { retry: 1, staleTime: 60_000, enabled: isConnected }
);
```

```typescript
// BEFORE (noGroup):
const noGroupQ = trpc.wazuh.agentsNoGroup.useQuery(
  { limit: 100, offset: noGroupPage * 100 },
  { retry: 1, staleTime: 60_000, enabled: isConnected }
);

// AFTER:
const noGroupQ = trpc.wazuh.agentsNoGroup.useQuery(
  {
    limit: 100,
    offset: noGroupPage * 100,
    ...(noGroupSort ? { sort: noGroupSort } : {}),
    ...(noGroupSearch ? { search: noGroupSearch } : {}),
  },
  { retry: 1, staleTime: 60_000, enabled: isConnected }
);
```

```typescript
// BEFORE (distinct):
const distinctQ = trpc.wazuh.agentsStatsDistinct.useQuery(
  { fields: distinctField },
  { retry: 1, staleTime: 60_000, enabled: isConnected }
);

// AFTER:
const distinctQ = trpc.wazuh.agentsStatsDistinct.useQuery(
  {
    fields: distinctField,
    limit: 100,
    offset: distinctPage * 100,
  },
  { retry: 1, staleTime: 60_000, enabled: isConnected }
);
```

### Step 9.3: Add Search Inputs to Outdated and NoGroup Tabs

Find the Outdated tab content. Add a search input and sort controls above the table:

```typescript
{/* Inside the Outdated TabsContent, before the table */}
<div className="flex items-center gap-2 mb-3">
  <Search className="h-3.5 w-3.5 text-muted-foreground" />
  <Input
    placeholder="Search outdated agents..."
    value={outdatedSearch}
    onChange={(e) => { setOutdatedSearch(e.target.value); setOutdatedPage(0); }}
    className="h-7 w-48 text-xs bg-secondary/20 border-border/30"
  />
</div>
```

Repeat for the NoGroup tab with `noGroupSearch`/`setNoGroupSearch`/`setNoGroupPage`.

### Step 9.4: Add Sortable Headers

Update the Outdated table headers to be sortable:

```typescript
<thead>
  <tr className="border-b border-border/30">
    <SortableHeader label="ID" field="id" currentSort={outdatedSort} onSort={(s) => { setOutdatedSort(s); setOutdatedPage(0); }} />
    <SortableHeader label="Name" field="name" currentSort={outdatedSort} onSort={(s) => { setOutdatedSort(s); setOutdatedPage(0); }} />
    <SortableHeader label="Version" field="version" currentSort={outdatedSort} onSort={(s) => { setOutdatedSort(s); setOutdatedPage(0); }} />
    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Manager Version</th>
  </tr>
</thead>
```

Use the same `SortableHeader` component from Section 3.4. Either copy it into this file or extract it to a shared component (see Section 10).

Apply the same pattern to the NoGroup table with `noGroupSort`.

### Step 9.5: Add Distinct Pagination

Find the Field Distribution tab. Add pagination after the data display:

```typescript
{(() => {
  const { total } = extractItems(distinctQ.data);
  const totalPages = Math.max(1, Math.ceil(total / 100));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/20">
      <span className="text-xs text-muted-foreground">Page {distinctPage + 1} of {totalPages}</span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={distinctPage === 0} onClick={() => setDistinctPage(p => p - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" disabled={(distinctPage + 1) * 100 >= total} onClick={() => setDistinctPage(p => p + 1)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
})()}
```

### Step 9.6: Reset on Field Change

Find where `distinctField` is set. Add page reset:

```typescript
// BEFORE:
onClick={() => setDistinctField(opt)}

// AFTER:
onClick={() => { setDistinctField(opt); setDistinctPage(0); }}
```

### Step 9.7: Verification

- [ ] Outdated tab: Search filters server-side. Sort by ID/Name/Version works. Page resets on search/sort.
- [ ] NoGroup tab: Same behavior.
- [ ] Distinct tab: Pagination controls appear when > 100 results. Changing field resets page.

---

## 10. Shared Utilities to Create

### 10.1: Extract SortableHeader to Shared Component

After implementing it in SecurityExplorer (Section 3.4), extract it so all pages can reuse it.

**Create** `client/src/components/shared/SortableHeader.tsx`:

```typescript
import { SortAsc, SortDesc, ArrowUpDown } from "lucide-react";

interface SortableHeaderProps {
  label: string;
  field: string;
  currentSort: string;
  onSort: (sort: string) => void;
  className?: string;
}

export function SortableHeader({ label, field, currentSort, onSort, className }: SortableHeaderProps) {
  const isActive = currentSort.replace(/^[+-]/, "") === field;
  const isAsc = currentSort === `+${field}`;

  const handleClick = () => {
    if (!isActive) onSort(`+${field}`);
    else if (isAsc) onSort(`-${field}`);
    else onSort("");
  };

  return (
    <th
      className={`text-left py-2 px-3 text-muted-foreground font-medium whitespace-nowrap cursor-pointer hover:text-foreground transition-colors select-none ${className ?? ""}`}
      onClick={handleClick}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          isAsc ? <SortAsc className="h-3 w-3 text-primary" /> : <SortDesc className="h-3 w-3 text-primary" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </th>
  );
}
```

**Export** from `client/src/components/shared/index.ts`:
```typescript
export { SortableHeader } from "./SortableHeader";
```

### 10.2: Debounce Hook (already exists in AgentHealth)

If needed in other files, extract the `useDebounced` hook from AgentHealth to a shared location:

**Create** `client/src/hooks/useDebounced.ts`:

```typescript
import { useState, useEffect, useRef } from "react";

export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    timer.current = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer.current);
  }, [value, delayMs]);

  return debounced;
}
```

### 10.3: Pagination Helper

Several pages duplicate the pagination UI. Consider extracting:

**Create** `client/src/components/shared/SimplePagination.tsx`:

```typescript
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SimplePaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  label?: string;
}

export function SimplePagination({ page, totalPages, total, onPageChange, label = "records" }: SimplePaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/10">
      <span className="text-xs text-muted-foreground">
        {total.toLocaleString()} total {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page <= 0}
          className="p-1 rounded hover:bg-secondary/30 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted-foreground">
          Page {page + 1} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="p-1 rounded hover:bg-secondary/30 disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

---

## 11. Testing Checklist

### Per-Component Verification

| Component | Test | Expected |
|---|---|---|
| **SecurityExplorer — Roles** | Load page → Roles tab | Table shows 25 rows, pagination visible if > 25 total |
| | Click "Name" header | Arrow appears, rows reorder alphabetically |
| | Click again | Arrow reverses, rows reorder descending |
| | Type in search | Results filter server-side, page resets to 1 |
| | Click page 2 | Next 25 rows load |
| **SecurityExplorer — Policies** | Same tests as Roles | Same behavior |
| **SecurityExplorer — Users** | Same tests as Roles | Same behavior |
| **SecurityExplorer — Actions** | Type "agents" in endpoint filter | Only agent-related actions shown |
| **FleetInventory — Any tab** | Click column header | Sort arrow, data reorders |
| | Toggle "Distinct" | Unique values only shown |
| | Hotfixes tab: type hotfix ID | Filtered results |
| **ITHygiene — Extensions** | Type in search | Results filtered server-side |
| | (after sort support) Click header | Sorted results |
| **ClusterHealth — Node Logs** | Select "Error" level | Only error logs |
| | Type tag name | Filtered by daemon tag |
| | Combine level + tag | Both filters applied |
| **ClusterHealth — Node Config** | Select "Global" section | Only global config |
| | Type field name | Filtered further |
| | Toggle Raw | Raw config format |
| **ClusterHealth — Node Stats** | Select date | Stats for that date |
| **Status — Manager Stats** | Select date | Stats for that date |
| **Status — Tasks** | Page through tasks | Different data per page |
| | Select "Failed" status | Only failed tasks |
| | Select "upgrade_module" | Only upgrade tasks |
| | Type search | Filtered results |
| **AgentHealth — Upgrades** | Type "001,002" | Only those agents' results |
| **GroupManagement — Outdated** | Type search | Server-filtered |
| | Click Name header | Sorted by name |
| **GroupManagement — NoGroup** | Same tests as Outdated | Same behavior |
| **GroupManagement — Distinct** | Switch to field with > 100 values | Pagination appears |

### Cross-Cutting Verification

- [ ] `tsc --noEmit` — zero TypeScript errors
- [ ] All page refreshes (`handleRefresh`) still invalidate queries
- [ ] Auto-refresh (Status.tsx) still works with new params
- [ ] `WazuhGuard` still gates all content when disconnected
- [ ] `BrokerWarnings` still displays on all data panels
- [ ] `RawJsonViewer` still works (shows raw API response including params)
- [ ] No React key warnings in console
- [ ] No infinite re-render loops (watch for query → state → query cycles)
- [ ] Mobile responsive: filters stack vertically on small screens

---

## 12. Appendix: Full Param Reference

### Wazuh Sort Syntax

Wazuh `sort` parameter format:
- `+fieldname` — ascending
- `-fieldname` — descending
- Multiple fields: `+field1,-field2` (comma-separated)

### Wazuh Search Syntax

Wazuh `search` parameter:
- Plain text: `search=apache` — substring match across all fields
- Complementary: `search=-apache` — everything NOT matching

**Important:** `search` and `q` are different parameters:
- `search` = Wazuh native full-text search
- `q` = structured query filter (e.g., `q=status=active;os.platform=ubuntu`)

### Parameter Types

| Param | Type | Notes |
|---|---|---|
| `offset` | number | 0-indexed start position |
| `limit` | number | Max items to return (1-500) |
| `sort` | string | `+field` or `-field`, comma-separated |
| `search` | string | Native full-text, prefix `-` for complementary |
| `select` | string | Comma-separated field names to return |
| `q` | string | Structured query: `field=value;field2>value2` |
| `distinct` | boolean | Return unique values only |
| `date` | string | Date filter (YYYY-MM-DD format) |
| `role_ids` | string | Comma-separated role IDs |
| `policy_ids` | string | Comma-separated policy IDs |
| `user_ids` | string | Comma-separated user IDs |
| `endpoint` | string | Security action endpoint filter |
| `agents_list` | string | Comma-separated agent IDs |
| `section` | string | Config section name |
| `field` | string | Config field name |
| `raw` | boolean | Return raw config format |
| `tag` | string | Log daemon tag filter |
| `level` | string | Log level: error, warning, info, debug |
| `status` | string | Task/agent status filter |
| `module` | string | Task module filter |
| `command` | string | Task command filter |
| `hotfix` | string | Hotfix ID filter |

### Wazuh Response Format

All list endpoints return:
```json
{
  "data": {
    "affected_items": [...],
    "total_affected_items": 150,
    "total_failed_items": 0,
    "failed_items": []
  }
}
```

Use `total_affected_items` for pagination total (NOT `affected_items.length`).
