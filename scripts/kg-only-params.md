# KG-Only Params to Wire (73 total)

## Path params (already in URL, just not in Zod schema) — 8 total
- scaPolicies: agent_id
- scaChecks: agent_id, policy_id
- syscheckFiles: agent_id
- agentPackages: agent_id
- agentPorts: agent_id
- agentProcesses: agent_id
- agentServices: agent_id

Note: These are path params already used in the URL template. The diff script flags them
because they're not in the Zod `.input()` schema as separate fields — they're extracted
from the URL path. These are FALSE POSITIVES and should be excluded from the diff.

## Actual query params to wire — 65 total

### managerLogs (4): sort, q, select, distinct
### clusterNodes (1): nodes_list
### agents (2): os.platform, manager
### agentGroups (1): groups_list
### groupAgents (5): select, sort, search, status, q, distinct (group_id is path param)
### rules (1): rule_ids
### syscheckFiles (12): sort, select, arch, value.name, value.type, summary, md5, sha1, sha256, distinct, q (agent_id is path)
### agentPorts (3): local.ip, local.port, remote.ip (agent_id is path)
### mitreTechniques (5): technique_ids, sort, select, q, distinct
### decoders (8): decoder_names, select, sort, q, filename, relative_dirname, status, distinct
### rootcheckResults (9): sort, search, select, q, distinct, status, pci_dss, cis (agent_id is path)
### ciscatResults (13): sort, search, select, benchmark, profile, pass, fail, error, notchecked, unknown, score, q (agent_id is path)
