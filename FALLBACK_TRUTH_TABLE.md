# Fallback Truth Table

**Date:** 2026-03-01
**Purpose:** Document the exact fallback behavior of every page when its data source is unavailable. This replaces all prior "mock fallback" language with precise, auditable descriptions.

---

## Terminology

| Term | Definition |
|---|---|
| **Live dependency** | The tRPC procedure(s) the page calls when the data source is online. |
| **Graceful fallback** | What the page renders when the data source is offline or returns no data. |
| **Mock dataset** | A hardcoded fixture file (`MOCK_*` constants) that provides synthetic data. **None exist in the codebase.** `client/src/lib/mockData.ts` was deleted in Phase 57. |

---

## Per-Page Behavior

### SOC Console (Home.tsx)

| Panel | Live Dependency | Graceful Fallback |
|---|---|---|
| Agent Summary | `trpc.wazuh.agentSummaryStatus` | All counters show `0` |
| Threat Trends (area chart) | `trpc.indexer.alertsAggByLevel` | Empty chart (no data points) |
| Top Talkers (donut) | `trpc.indexer.alertsAggByAgent` | Empty chart |
| Geographic Heatmap | `trpc.indexer.alertsGeoEnriched` → `alertsGeoAgg` | Empty map (no circles) |
| Top Firing Rules | `trpc.indexer.alertsAggByRule` | Empty table |
| MITRE Tactic Activity | `trpc.indexer.alertsAggByMitre` | Empty chart |
| EPS Gauge | `trpc.indexer.alertsAggByLevel` (derived) | Shows `0 EPS` |
| Manager Status | `trpc.wazuh.managerStatus` | Hidden or "Not Connected" |
| Recent Agents | `trpc.wazuh.agents` | Empty table |
| Connectivity Panel | `trpc.wazuh.status` + `trpc.indexer.status` | Shows "Not Set" badges |

**Source badges:** "Indexer" (green) or "Server API" (purple). No "Mock" badge exists.

---

### Fleet Command (AgentHealth.tsx)

| Panel | Live Dependency | Graceful Fallback |
|---|---|---|
| Agent grid | `trpc.wazuh.agents` | `IndexerErrorState` or `IndexerLoadingState` component |
| OS distribution | `trpc.wazuh.agentSummaryOs` | Empty chart |
| Group summary | `trpc.wazuh.agentGroups` | Empty list |

---

### Alerts Timeline (AlertsTimeline.tsx)

| Panel | Live Dependency | Graceful Fallback |
|---|---|---|
| Alert table | `trpc.indexer.alertsSearch` | Empty table, `totalAlerts: 0` |
| Severity timeline | `trpc.indexer.alertsAggByLevel` | Empty array `[]` |
| Rule distribution | `trpc.indexer.alertsAggByRule` | Empty array `[]` |
| Agent filter options | `trpc.indexer.alertsAggByAgent` | Empty array `[]` |
| Weekly heatmap | `trpc.wazuh.statsWeekly` | Zeroed 7×24 grid (all values `0`) |

---

### Vulnerabilities (Vulnerabilities.tsx)

| Panel | Live Dependency | Graceful Fallback |
|---|---|---|
| Vulnerability table | `trpc.indexer.vulnSearch` or `trpc.wazuh.vulnerabilities` | Empty table |
| Fleet severity distribution | `trpc.indexer.vulnAggBySeverity` | Empty array, `fleetTotal: 0`, `fleetAvgCvss: "0.0"` |
| Top vulnerable agents | `trpc.indexer.vulnAggByAgent` | Empty array |
| Top packages | `trpc.indexer.vulnAggByPackage` | Empty array |
| Top CVEs | `trpc.indexer.vulnAggByCVE` | Empty array |

---

### MITRE ATT&CK (MitreAttack.tsx)

| Panel | Live Dependency | Graceful Fallback |
|---|---|---|
| Tactic heatmap | `trpc.wazuh.rules` (MITRE-tagged) | Empty technique list |
| Indexer tactic alerts | `trpc.indexer.alertsAggByMitre` | Empty array, `totalMitreAlerts: 0` |
| Tactic progression timeline | `trpc.indexer.alertsAggByMitre` (timeline buckets) | Empty array |
| Top techniques | `trpc.indexer.alertsAggByMitre` (technique buckets) | Empty array |

---

### Compliance Posture (Compliance.tsx)

| Panel | Live Dependency | Graceful Fallback |
|---|---|---|
| SCA checks table | `trpc.wazuh.scaChecks` | Empty table |
| Indexer compliance data | `trpc.indexer.alertsComplianceAgg` | `total: 0`, empty `byControl`, `bySeverity`, `timeline` arrays |
| Framework alert trend chart | `trpc.indexer.alertsComplianceAgg` (timeline buckets) | Empty chart |

---

### File Integrity (FileIntegrity.tsx)

| Panel | Live Dependency | Graceful Fallback |
|---|---|---|
| Syscheck events table | `trpc.wazuh.syscheckEvents` | Empty table |
| Last scan info | `trpc.wazuh.syscheckLastScan` | "No scan data" |

---

### IT Hygiene (ITHygiene.tsx)

| Panel | Live Dependency | Graceful Fallback |
|---|---|---|
| Packages table | `trpc.wazuh.agentPackages` | Empty table |
| Ports table | `trpc.wazuh.agentPorts` | Empty table |
| Processes table | `trpc.wazuh.agentProcesses` | Empty table |
| Services table | `trpc.wazuh.agentServices` | Empty table |
| Users table | `trpc.wazuh.agentUsers` | Empty table |
| KPI stat cards | Derived from above | All show `0` |

---

### Configuration Drift (DriftComparison.tsx)

| Panel | Live Dependency | Graceful Fallback |
|---|---|---|
| Agent comparison grid | `trpc.wazuh.agents` + `multiAgentSyscollector` | Empty comparison (no agents selected) |
| Drift detection | Pure function over live data | No drift items |

---

### SIEM Events (SiemEvents.tsx)

| Panel | Live Dependency | Graceful Fallback |
|---|---|---|
| Event stream table | `trpc.indexer.alertsSearch` | Empty table |
| Log source distribution | `trpc.indexer.alertsAggByDecoder` | Empty chart |
| Event volume timeline | `trpc.indexer.alertsTimeline` | Empty chart |

---

### Threat Hunting (ThreatHunting.tsx)

| Panel | Live Dependency | Graceful Fallback |
|---|---|---|
| Hunt results | `trpc.wazuh.*` + `trpc.indexer.*` (cross-correlation) | Empty results, "No matches found" |

---

### Ruleset Explorer (RulesetExplorer.tsx)

| Panel | Live Dependency | Graceful Fallback |
|---|---|---|
| Rules table | `trpc.wazuh.rules` | Empty table |
| Decoders table | `trpc.wazuh.decoders` | Empty table |
| CDB Lists | `trpc.wazuh.cdbLists` | Empty table |

---

### Cluster Health (ClusterHealth.tsx)

| Panel | Live Dependency | Graceful Fallback |
|---|---|---|
| Daemon status | `trpc.wazuh.managerStatus` | Empty list |
| Manager info | `trpc.wazuh.managerInfo` | "Not connected" |
| Cluster nodes | `trpc.wazuh.clusterNodes` | Empty table |
| Hourly stats | `trpc.wazuh.statsHourly` | Empty chart |

---

### Threat Intel (ThreatIntel.tsx)

| Panel | Live Dependency | Graceful Fallback |
|---|---|---|
| OTX pulse search | `trpc.otx.searchPulses` | Empty results |
| IP/domain lookup | `trpc.otx.lookupIndicator` | Error state |

**Note:** OTX is a third-party API (AlienVault). No fallback data exists; errors show an error state.

---

### Live Alert Feed (LiveAlertFeed component)

| Panel | Live Dependency | Graceful Fallback |
|---|---|---|
| SSE alert stream | `/api/sse/alerts` (Server-Sent Events) | Status badge shows "Indexer N/A" or "Connecting" |

---

## Summary

| Metric | Value |
|---|---|
| Total pages audited | 14 |
| Pages with mock dataset fallback | **0** |
| Pages with empty-state fallback | **14** |
| `client/src/lib/mockData.ts` | **Deleted** (Phase 57) |
| `MOCK_*` imports in frontend | **0** |
| User-visible "Mock" labels in UI | **0** |
| SourceBadge variants | "Indexer" and "Server API" only |

**Bottom line:** Every page falls back to empty arrays, zeroed counters, or error states when its data source is unavailable. No synthetic/mock data is injected anywhere. The word "mock" has been removed from all UI code comments as of this audit.
