# Broker Filter Frontend Test Plan

**Author:** Manus AI
**Date:** 2026-03-10
**Scope:** Validate all new filter, sort, and pagination controls added during the Broker Coverage Remediation across 7 frontend pages.
**Prerequisites:** Wazuh API connected (`SKIP_TLS_VERIFY=true`), at least 2 agents reporting, LLM endpoint optional.

---

## 1. Test Environment

| Item | Requirement |
|------|-------------|
| Wazuh Manager | v4.x with API enabled |
| Agents | Minimum 2 active agents (1 Linux, 1 Windows preferred) |
| Browser | Chromium-based, 1920px+ width |
| Auth | Logged in as admin user |
| API Status | SOC Console shows green "Wazuh API Connected" indicator |

Before running any tests, confirm the Wazuh connection is live by navigating to the SOC Console and verifying the API connectivity panel shows a successful connection. All tests below assume live data from the Wazuh API — no mock data is used.

---

## 2. SecurityExplorer (`/security-explorer`)

The SecurityExplorer page has 4 tabs (Roles, Users, All Policies, Actions) with server-side search, sortable column headers, pagination, and an endpoint filter on the Actions tab. The backend endpoints exercised are `securityRoles`, `securityUsers`, `securityPolicies`, and `securityActions`.

### 2.1 Server-Side Search

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| SE-1 | Search filters across active tab | Type "admin" in the search input on the Roles tab | Only roles containing "admin" appear; result count updates |
| SE-2 | Search persists on same tab | Clear search, type "read" | Results filter to roles containing "read" |
| SE-3 | Search resets pagination | Navigate to page 2 of Roles, then type a search term | Page resets to 1; filtered results shown |
| SE-4 | Empty search shows all | Clear the search input entirely | Full unfiltered list returns |
| SE-5 | Search applies to Users tab | Switch to Users tab, type a username fragment | Only matching users appear |
| SE-6 | Search applies to Policies tab | Switch to All Policies tab, type a policy name fragment | Only matching policies appear |

### 2.2 Sortable Column Headers (SortableHeader)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| SE-7 | Sort Roles by ID ascending | Click the "ID" column header on Roles tab | Arrow indicator shows ascending; rows sorted by ID asc |
| SE-8 | Toggle sort to descending | Click the same "ID" header again | Arrow flips to descending; rows reverse |
| SE-9 | Third click clears sort | Click the "ID" header a third time | Sort indicator disappears; default order restored |
| SE-10 | Sort Roles by Name | Click "Name" column header | Rows sorted alphabetically by name |
| SE-11 | Sort Users by ID | Switch to Users tab, click "ID" header | Users sorted by ID |
| SE-12 | Sort Users by Username | Click "Username" header | Users sorted alphabetically by username |
| SE-13 | Sort Policies by ID | Switch to All Policies tab, click "ID" header | Policies sorted by ID |
| SE-14 | Sort Policies by Name | Click "Name" header | Policies sorted alphabetically |
| SE-15 | Sort resets pagination | Be on page 2, click a sort header | Page resets to 1 |

### 2.3 Pagination

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| SE-16 | Next page loads | Click the "Next" pagination button on Roles tab | Page 2 loads with next batch of results |
| SE-17 | Previous page works | Click "Previous" after navigating to page 2 | Returns to page 1 |
| SE-18 | Page indicator accurate | Navigate through pages | "Page X of Y" indicator matches actual data |
| SE-19 | Pagination disabled at bounds | On page 1, "Previous" is disabled; on last page, "Next" is disabled | Buttons correctly disabled |

### 2.4 Actions Endpoint Filter

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| SE-20 | Filter actions by endpoint | Switch to Actions tab, type an endpoint path (e.g., "agents") in the endpoint filter | Only actions matching that endpoint appear |
| SE-21 | Clear endpoint filter | Clear the endpoint filter input | All actions return |
| SE-22 | Clear button works | Click the X icon on the endpoint filter | Filter clears, all actions shown |

---

## 3. FleetInventory (`/fleet-inventory`)

The FleetInventory page uses a tabbed syscollector layout (Packages, Processes, Ports, OS, Hardware, Hotfixes, Network Address, Network Interface, Network Protocol) with per-tab sort state, a distinct toggle, and a hotfix-specific filter. Backend endpoints are the 9 `expSyscollector*` broker-wired procedures.

### 3.1 Per-Tab Sort

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| FI-1 | Sort packages by name | On Packages tab, click the sort control and select "name" | Packages sorted alphabetically; `sort` param sent to API |
| FI-2 | Sort direction toggles | Click the same sort field again | Direction changes (asc → desc or vice versa) |
| FI-3 | Sort state is per-tab | Sort Packages by name desc, switch to Processes tab | Processes tab has its own independent sort state (default) |
| FI-4 | Return to tab preserves sort | Switch back to Packages tab | Previous sort (name desc) is still active |
| FI-5 | Sort resets pagination | Navigate to page 2 of Packages, then change sort | Page resets to 1 |

### 3.2 Distinct Toggle

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| FI-6 | Enable distinct mode | Toggle the "Distinct" switch on | Query includes `distinct: true`; duplicate rows removed from results |
| FI-7 | Disable distinct mode | Toggle the "Distinct" switch off | Full result set returns including duplicates |
| FI-8 | Distinct persists across tabs | Enable distinct on Packages, switch to Ports | Distinct toggle state carries over (global toggle) |

### 3.3 Hotfix Filter

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| FI-9 | Filter hotfixes by KB ID | Switch to Hotfixes tab, enter a KB article ID (e.g., "KB5034") in the hotfix filter | Only matching hotfixes appear |
| FI-10 | Hotfix filter only on Hotfixes tab | Switch to Packages tab | Hotfix filter input is not visible (tab-specific) |
| FI-11 | Clear hotfix filter | Clear the input or click X | All hotfixes return |

### 3.4 Search + Pagination

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| FI-12 | Search filters current tab | Type a package name in the search input | Results filtered via `q=name~{search}` parameter |
| FI-13 | Pagination works | Click Next/Previous pagination buttons | Correct page of results loads with proper offset |
| FI-14 | Search resets pagination | Be on page 2, type a new search term | Page resets to 1 |

---

## 4. ITHygiene (`/it-hygiene`)

The ITHygiene page passes `sort` and `search` parameters to 6 syscollector queries (extensions, users, groups, hotfixes, services, ports) via shared `tabProps`. Backend endpoints are `agentBrowserExtensions`, `agentUsers`, `agentGroups2`, `agentHotfixes`, `agentServices`, and `agentPorts`.

### 4.1 Sort Parameter Propagation

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| IH-1 | Sort extensions | On Extensions tab, if sort controls are available, select a sort field | Query includes `sort` param; results reorder |
| IH-2 | Sort services | Switch to Services tab, apply sort | Services reorder by selected field |
| IH-3 | Sort users | Switch to Users tab, apply sort | Users reorder |
| IH-4 | Sort resets on tab change | Change tabs | Sort state resets to default for the new tab |

### 4.2 Search Parameter Propagation

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| IH-5 | Search extensions | Type a search term on Extensions tab | Query includes `search` param; filtered results |
| IH-6 | Search hotfixes | Switch to Hotfixes tab, type a search term | Hotfixes filtered by search |
| IH-7 | Search services | Switch to Services tab, type a search term | Services filtered |

### 4.3 Agent Selector

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| IH-8 | Change agent | Select a different agent from the agent dropdown | All tab queries re-fetch with new `agentId` |
| IH-9 | Agent change resets page | Be on page 2, change agent | Page resets to 0 |

---

## 5. ClusterHealth (`/cluster-health`)

The ClusterHealth page adds log level/tag filters, config section/field/raw controls, and a stats date picker to the NodeDrillDown component. Backend endpoints are `clusterNodeLogs`, `clusterNodeConfiguration`, and `clusterNodeStats`.

### 5.1 Node Log Filters

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| CH-1 | Filter logs by level | Select a node, open the logs panel, select "error" from the Level dropdown | Only error-level logs appear |
| CH-2 | Filter logs by tag | Type a tag name (e.g., "wazuh-analysisd") in the Tag input | Only logs with that tag appear |
| CH-3 | Combine level + tag | Set level to "warning" and tag to "wazuh-remoted" | Only warning logs from wazuh-remoted appear |
| CH-4 | Clear level filter | Set level back to empty/all | All log levels return (tag filter still active) |
| CH-5 | Clear tag filter | Click the X button on the tag input | Tag filter clears; level filter still active |
| CH-6 | Log search + level combo | Type a search term AND set a level filter | Both filters applied simultaneously |

### 5.2 Node Configuration Controls

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| CH-7 | Filter config by section | Type a section name (e.g., "global") in the Section input | Only that config section returned |
| CH-8 | Filter config by field | Type a field name (e.g., "jsonout_output") in the Field input | Only that specific field returned |
| CH-9 | Toggle raw mode | Check the "Raw" checkbox | Config returned in raw XML format instead of parsed JSON |
| CH-10 | Combine section + field | Set section to "alerts" and field to "log_alert_level" | Only that specific setting returned |
| CH-11 | Clear section/field | Clear both inputs | Full configuration returned |

### 5.3 Node Stats Date Picker

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| CH-12 | Set stats date | Enter a date in the stats date input (YYYY-MM-DD format) | Stats for that specific date returned |
| CH-13 | Clear stats date | Clear the date input or click X | Current/default stats returned |
| CH-14 | Invalid date handled | Enter an invalid date string | Graceful error or empty result, no crash |

---

## 6. Status (`/status`)

The Status page adds a manager stats date picker and a full task status table with search, status filter, module filter, and pagination. Backend endpoints are `managerStats` and `taskStatus`.

### 6.1 Manager Stats Date Picker

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| ST-1 | Set stats date | Enter a date in the Manager Stats date picker | Stats for that date returned and displayed |
| ST-2 | Clear stats date | Clear the date input or click X | Current stats returned |

### 6.2 Task Status Search

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| ST-3 | Search tasks | Type a search term in the task search input | Tasks filtered by the search term |
| ST-4 | Clear search | Clear the search input | All tasks return |

### 6.3 Task Status Filters

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| ST-5 | Filter by status | Select a status from the Status dropdown (e.g., "In progress", "Done", "Failed") | Only tasks with that status appear |
| ST-6 | Filter by module | Select a module from the Module dropdown (e.g., "upgrade_module") | Only tasks from that module appear |
| ST-7 | Combine status + module | Set both status and module filters | Both filters applied simultaneously |
| ST-8 | Clear filters | Reset both dropdowns to empty | All tasks return |

### 6.4 Task Status Pagination

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| ST-9 | Navigate task pages | Click Next/Previous pagination buttons | Correct page of tasks loads (25 per page) |
| ST-10 | Filters reset pagination | Apply a filter while on page 2 | Page resets to 0 |
| ST-11 | Page indicator accurate | Navigate through pages | Page indicator shows correct current/total |

---

## 7. AgentHealth (`/agent-health`)

The AgentHealth page adds an agent filter to the upgrade results query. Backend endpoint is `agentsUpgradeResult`.

### 7.1 Upgrade Results Agent Filter

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| AH-1 | Filter by agent ID | Enter an agent ID (e.g., "001") in the upgrade results agent filter | Only upgrade results for that agent appear |
| AH-2 | Clear agent filter | Clear the input or click X | All upgrade results return |
| AH-3 | Invalid agent ID | Enter a non-existent agent ID | Empty results, no error |

---

## 8. GroupManagement (`/group-management`)

The GroupManagement page adds search and sortable headers to the Outdated Agents and No-Group Agents tabs, plus pagination and field selection for the Stats Distinct tab. Backend endpoints are `agentsOutdated`, `agentsNoGroup`, and `agentsStatsDistinct`.

### 8.1 Outdated Agents Search + Sort

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| GM-1 | Search outdated agents | Type an agent name in the Outdated tab search input | Only matching outdated agents appear |
| GM-2 | Sort by ID | Click the "ID" SortableHeader on the Outdated tab | Agents sorted by ID ascending |
| GM-3 | Sort by Name | Click the "Name" SortableHeader | Agents sorted alphabetically by name |
| GM-4 | Sort by Version | Click the "Version" SortableHeader | Agents sorted by version |
| GM-5 | Toggle sort direction | Click the same header again | Direction toggles (asc ↔ desc) |
| GM-6 | Sort resets pagination | Be on page 2, click a sort header | Page resets to 0 |
| GM-7 | Search resets pagination | Be on page 2, type a search term | Page resets to 0 |

### 8.2 No-Group Agents Search + Sort

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| GM-8 | Search no-group agents | Type an agent name in the No-Group tab search input | Only matching no-group agents appear |
| GM-9 | Sort by ID | Click the "ID" SortableHeader on the No-Group tab | Agents sorted by ID |
| GM-10 | Sort by Name | Click "Name" header | Agents sorted by name |
| GM-11 | Sort by IP | Click "IP" header | Agents sorted by IP address |
| GM-12 | Sort by Status | Click "Status" header | Agents sorted by status |

### 8.3 Stats Distinct Pagination + Field Selection

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| GM-13 | Change distinct field | Click a different field button (e.g., "os.name", "version") | Query re-fetches with new `fields` param; results update |
| GM-14 | Paginate distinct results | Click Next/Previous pagination buttons | Correct page of distinct values loads (100 per page) |
| GM-15 | Field change resets pagination | Be on page 2, select a different field | Page resets to 0 |

---

## 9. Cross-Cutting Concerns

These tests validate behaviors that should be consistent across all pages.

### 9.1 Empty String → Undefined Conversion

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| CC-1 | Empty search sends no param | Clear a search input on any page | Network request does NOT include `search: ""` — the param is omitted entirely |
| CC-2 | Empty filter sends no param | Clear a filter dropdown on any page | Network request does NOT include the filter key with empty value |

**Verification method:** Open browser DevTools → Network tab → filter for `/api/trpc` requests → inspect the query parameters in the URL. Empty strings should result in the parameter being absent, not present with an empty value.

### 9.2 Pagination Reset on Filter Change

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| CC-3 | Search resets page (SecurityExplorer) | Navigate to page 2 of Roles, type a search | Page resets to 0 (first page) |
| CC-4 | Sort resets page (GroupManagement) | Navigate to page 2 of Outdated, click a sort header | Page resets to 0 |
| CC-5 | Filter resets page (Status) | Navigate to page 2 of Tasks, select a status filter | Page resets to 0 |
| CC-6 | Tab change resets page (FleetInventory) | Navigate to page 2 of Packages, switch to Ports tab | Page resets to 1 (FleetInventory is 1-indexed) |

### 9.3 Loading States

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| CC-7 | Loading indicator on filter change | Apply any filter on any page | Brief loading spinner/skeleton appears while data refetches |
| CC-8 | No flash of stale data | Change sort order rapidly | Previous data does not flash before new data arrives |

### 9.4 Error Handling

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| CC-9 | API error shows glass-panel error | Disconnect Wazuh API, navigate to any page | Glass-panel error state shown, no crash |
| CC-10 | Reconnect recovers | Reconnect Wazuh API, refresh page | Data loads normally |

### 9.5 Broker Warnings

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| CC-11 | Broker warnings display | If a broker-wired endpoint returns warnings (e.g., unsupported param) | Warning banner appears below the relevant section |
| CC-12 | Warnings don't block data | Broker warning present | Data still renders alongside the warning |

---

## 10. Backend API Contract Validation

These tests verify that the tRPC procedures correctly pass parameters through to the Wazuh API. Run these via the browser DevTools Network tab or via direct tRPC calls.

### 10.1 Endpoint-to-Broker Config Mapping

| tRPC Procedure | Wazuh API Endpoint | Broker Config | Key Params to Verify |
|----------------|-------------------|---------------|---------------------|
| `securityRoles` | `GET /security/roles` | `SECURITY_ROLES_CONFIG` | `limit`, `offset`, `search`, `sort` |
| `securityPolicies` | `GET /security/policies` | `SECURITY_POLICIES_CONFIG` | `limit`, `offset`, `search`, `sort` |
| `securityUsers` | `GET /security/users` | `SECURITY_USERS_CONFIG` | `limit`, `offset`, `search`, `sort` |
| `securityActions` | `GET /security/actions` | manual | `endpoint` |
| `managerStats` | `GET /manager/stats` | manual | `date` |
| `clusterNodeStats` | `GET /cluster/{node}/stats` | manual | `date` |
| `clusterNodeConfiguration` | `GET /cluster/{node}/configuration` | `CLUSTER_NODE_CONFIGURATION_CONFIG` | `section`, `field`, `raw` |
| `clusterNodeLogs` | `GET /cluster/{node}/logs` | `CLUSTER_NODE_LOGS_CONFIG` | `limit`, `offset`, `search`, `level`, `tag`, `sort` |
| `taskStatus` | `GET /tasks/status` | `TASKS_STATUS_CONFIG` | `limit`, `offset`, `search`, `status`, `module`, `sort` |
| `agentsOutdated` | `GET /agents/outdated` | `AGENTS_OUTDATED_CONFIG` | `limit`, `offset`, `search`, `sort` |
| `agentsNoGroup` | `GET /agents/no_group` | `AGENTS_NO_GROUP_CONFIG` | `limit`, `offset`, `search`, `sort` |
| `agentsStatsDistinct` | `GET /agents/stats/distinct` | `AGENTS_STATS_DISTINCT_CONFIG` | `limit`, `offset`, `fields`, `sort` |
| `agentBrowserExtensions` | `GET /syscollector/{agent}/extensions` | `SYSCOLLECTOR_BROWSER_EXTENSIONS_CONFIG` | `limit`, `offset`, `search`, `sort` |
| `agentUsers` | `GET /syscollector/{agent}/users` | `SYSCOLLECTOR_USERS_CONFIG` | `limit`, `offset`, `search`, `sort` |
| `agentGroups2` | `GET /syscollector/{agent}/groups` | `SYSCOLLECTOR_GROUPS_CONFIG` | `limit`, `offset`, `search`, `sort` |
| `agentsUpgradeResult` | `GET /agents/upgrade_result` | manual | `agents_list` |
| `expSyscollectorPackages` | `GET /experimental/syscollector/packages` | `EXP_SYSCOLLECTOR_PACKAGES_CONFIG` | `limit`, `offset`, `search`, `sort`, `distinct` |
| `expSyscollectorProcesses` | `GET /experimental/syscollector/processes` | `EXP_SYSCOLLECTOR_PROCESSES_CONFIG` | `limit`, `offset`, `search`, `sort`, `distinct` |
| `expSyscollectorPorts` | `GET /experimental/syscollector/ports` | `EXP_SYSCOLLECTOR_PORTS_CONFIG` | `limit`, `offset`, `search`, `sort`, `distinct` |
| `expSyscollectorHotfixes` | `GET /experimental/syscollector/hotfixes` | `EXP_SYSCOLLECTOR_HOTFIXES_CONFIG` | `limit`, `offset`, `search`, `sort`, `distinct`, `hotfix` |
| `expSyscollectorNetiface` | `GET /experimental/syscollector/netiface` | `EXP_SYSCOLLECTOR_NETIFACE_CONFIG` | `limit`, `offset`, `search`, `sort` |
| `expSyscollectorNetaddr` | `GET /experimental/syscollector/netaddr` | `EXP_SYSCOLLECTOR_NETADDR_CONFIG` | `limit`, `offset`, `search`, `sort` |
| `expSyscollectorNetproto` | `GET /experimental/syscollector/netproto` | `EXP_SYSCOLLECTOR_NETPROTO_CONFIG` | `limit`, `offset`, `search`, `sort` |
| `expSyscollectorOs` | `GET /experimental/syscollector/os` | `EXP_SYSCOLLECTOR_OS_CONFIG` | `limit`, `offset`, `search`, `sort` |
| `expSyscollectorHardware` | `GET /experimental/syscollector/hardware` | `EXP_SYSCOLLECTOR_HARDWARE_CONFIG` | `limit`, `offset`, `search`, `sort` |

### 10.2 Parameter Passthrough Verification

For each endpoint above, verify that the frontend parameter reaches the Wazuh API query string by checking the server logs or using the Wazuh API directly:

```bash
# Example: Verify securityRoles passes sort param
# In browser DevTools Network tab, filter for "securityRoles"
# The tRPC URL should contain: input={"json":{"limit":25,"offset":0,"sort":"+name"}}
# The Wazuh API call should translate to: GET /security/roles?limit=25&offset=0&sort=%2Bname
```

---

## 11. Regression Checks

These tests ensure the new controls did not break existing functionality.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| RG-1 | SecurityExplorer RBAC Rules tab | Navigate to RBAC Rules tab | Rules still load and display correctly (this tab was not modified) |
| RG-2 | SecurityExplorer Current User tab | Navigate to Current User tab | Current user info still displays (not modified) |
| RG-3 | FleetInventory agent selector | Select different agents in FleetInventory | Agent-specific data loads correctly |
| RG-4 | ITHygiene network tab | Navigate to Network tab in ITHygiene | Network interfaces, addresses, protocols still display |
| RG-5 | ClusterHealth node selector | Select different cluster nodes | Node-specific data loads for each node |
| RG-6 | Status page health checks | Navigate to Status page | All health check sections still render |
| RG-7 | AgentHealth charts | Navigate to Agent Health | OS distribution, version charts still render |
| RG-8 | GroupManagement group list | Navigate to Group Management | Group list with agent counts still loads |
| RG-9 | Raw JSON viewer | Click "Raw JSON" on any page with the viewer | Raw JSON modal opens with correct data |
| RG-10 | Export functionality | Click Export on any page with export button | CSV/JSON export works correctly |

---

## 12. Test Execution Checklist

Use this checklist to track test execution progress. Mark each section as complete when all tests in that section pass.

| Section | Tests | Status |
|---------|-------|--------|
| 2. SecurityExplorer | SE-1 through SE-22 (22 tests) | [ ] |
| 3. FleetInventory | FI-1 through FI-14 (14 tests) | [ ] |
| 4. ITHygiene | IH-1 through IH-9 (9 tests) | [ ] |
| 5. ClusterHealth | CH-1 through CH-14 (14 tests) | [ ] |
| 6. Status | ST-1 through ST-11 (11 tests) | [ ] |
| 7. AgentHealth | AH-1 through AH-3 (3 tests) | [ ] |
| 8. GroupManagement | GM-1 through GM-15 (15 tests) | [ ] |
| 9. Cross-Cutting | CC-1 through CC-12 (12 tests) | [ ] |
| 10. API Contract | Manual verification per endpoint (25 endpoints) | [ ] |
| 11. Regression | RG-1 through RG-10 (10 tests) | [ ] |
| **Total** | **135 test cases** | |

---

## 13. Known Limitations

The following items are known constraints that should not be flagged as failures during testing:

1. **Cluster endpoints require multi-node cluster.** If running a single-node Wazuh deployment, ClusterHealth tests (CH-1 through CH-14) will show empty states or connection errors. This is expected behavior.

2. **Task status requires active upgrade tasks.** If no agent upgrades have been initiated, Status tests ST-3 through ST-11 will show empty tables. Initiate an agent upgrade first to populate task data.

3. **Hotfix data is Windows-only.** FleetInventory hotfix tests (FI-9 through FI-11) and ITHygiene hotfix tests require at least one Windows agent reporting hotfix data.

4. **Browser extensions data is rare.** ITHygiene and FleetInventory extension tabs may show empty results if no agents report browser extension data via the Wazuh syscollector module.

5. **Stats date parameter format.** The `date` parameter for `managerStats` and `clusterNodeStats` must be in `YYYY-MM-DD` format. Other formats may return errors from the Wazuh API.

6. **Sort format convention.** Sort values use the `+field` (ascending) and `-field` (descending) convention per the Wazuh API specification. The SortableHeader component handles this formatting automatically.
