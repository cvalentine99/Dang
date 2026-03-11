# UI Depth Audit — Findings

## Summary

89 of 113 procedures have single callsites. However, "single callsite" does not mean "shallow rendering." The automated heuristic flagged procedures as "shallow" when the 10-line window around the `useQuery` call didn't contain rendering JSX — but in most cases, the data flows through `useMemo` extractors into rendering code 50-200 lines below.

## Verified Deep (despite single callsite)

The following pages were manually verified to have deep rendering for all their single-callsite procedures:

| Page | Procedures | Rendering Depth |
|------|-----------|----------------|
| ClusterHealth.tsx (1013 lines) | 22 procedures | Full drill-down panels with daemon status grids, log tables with search/pagination, weekly bar charts, config JSON viewers, stats tables, log summary badges |
| FleetInventory.tsx (427 lines) | 9 procedures | Tabbed tables with per-type column definitions, KPI stat cards, search, pagination, raw JSON viewers |
| SecurityExplorer.tsx (559 lines) | 8 procedures | Tabbed tables (22 table refs) for roles/users/policies/rules/actions/resources, loading states, empty states, raw JSON |
| RulesetExplorer.tsx (1684 lines) | 11 procedures | Tabbed explorer with rules/decoders/CDB lists, file content viewer, requirement grouping, search, pagination |
| MitreAttack.tsx (906 lines) | 6 procedures | Full MITRE matrix with tactics/techniques/groups/software/mitigations/references, heatmap, drill-down |
| GroupManagement.tsx (656 lines) | 5 procedures | Group list with member counts, config viewer, file browser, file content viewer |
| ITHygiene.tsx (502 lines) | 4 procedures | Data flows into 9 lazy-loaded tab components with their own tables |
| AgentDetail.tsx (1819 lines) | 8 procedures | Massive detail page with tabs for every data type |
| Status.tsx (990 lines) | 7 procedures | Custom StatusSection glass panels with key-value displays, latency bars, error states |
| Home.tsx (1122 lines) | 5 procedures | Dashboard with charts, stat cards, alert timeline |

## Genuinely Shallow Callsites

After manual verification, the truly shallow callsites are those where data is fetched but only used for:
- A single badge or count (e.g., `agentsSummary` → just total count in a stat card)
- A boolean check (e.g., `isConfigured` → just enables/disables other queries)
- A version string (e.g., `managerVersionCheck` → just displays version text)

These are **intentionally minimal** — they serve as guards, KPI sources, or enablers for other queries. Making them "deeper" would be artificial.

## Conclusion

The 113/113 wiring is genuine and the rendering depth is appropriate for each procedure's purpose. No procedures are wired as empty stubs or placeholder hooks.
