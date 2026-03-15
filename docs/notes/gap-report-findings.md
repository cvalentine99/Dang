# GAP Report Key Findings — March 4, 2026

## 3 Contract Truth Errors (doc errors, router correct)

### ERROR #1 — Phantom Endpoint (wazuh.agentUsers)
- Contract says: wazuh.agentUsers → GET /experimental/syscollector/users
- Reality: GET /experimental/syscollector/users does NOT exist in spec
- Router correctly calls /syscollector/${agentId}/users
- Fix: Amend contract table to GET /syscollector/{agent_id}/users

### ERROR #2 — Non-Existent MITRE Root (wazuh.mitreOverview)
- Contract says: wazuh.mitreOverview → GET /mitre
- Reality: GET /mitre does NOT exist. Spec has 7 sub-paths only
- Router correctly implements all 7 sub-endpoints
- Fix: Remove wazuh.mitreOverview, replace with 7-row expansion

### ERROR #3 — Vulnerability Endpoint Attribution
- Contract says: wazuh.vulnerabilities → GET /vulnerability/{agent_id}
- Reality: GET /vulnerability/{agent_id} removed in Wazuh 4.8
- Router correctly uses Wazuh Indexer (wazuh-states-vulnerabilities-*)
- Fix: Move to Indexer section as indexer.vulnSearchByAgent

## 39 GET Endpoint Gaps (P2/P3 priority)

### P2 — Medium (5 endpoints)
- GET /agents/summary
- GET /manager/version/check
- GET /manager/configuration/{component}/{configuration}
- GET /security/config
- GET /security/users/me

### P3 — Low (34 endpoints)
- Security RBAC: /security/rules, /security/actions, /security/resources, /security/users/me/policies
- Lists/Groups: /lists/files/{filename}, /groups/{group_id}/files/{file_name}
- Agents: /agents/upgrade_result, /agents/uninstall, /agents/{agent_id}/group/is_sync
- Cluster per-node: 12 endpoints (stats, logs, config variants)
- Experimental bulk: 10 endpoints (all-agent syscollector/ciscat)
- API info: GET /
