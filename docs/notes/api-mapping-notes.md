# Wazuh API Dashboard Mapping - Key Findings

## Two APIs:
1. **Wazuh Server API** (port 55000) - Real-time operational, transactional, state checks
2. **Wazuh Indexer API** (port 9200) - High-throughput data retrieval, aggregations, historical search

## Index Patterns:
- `wazuh-alerts-*` — Primary alerts index (SOC monitoring, MITRE, threat hunting)
- `wazuh-archives-*` — Raw events before rule evaluation (forensic investigation)
- `wazuh-monitoring-*` — Agent connection telemetry (fleet health, stability)
- `wazuh-statistics-*` — Internal performance metrics (manager health, queue monitoring)
- `wazuh-states-vulnerabilities-*` — Global vulnerability state (CVE tracking, patch velocity)

## Authentication:
- POST /security/user/authenticate → JWT token (900s lifespan)
- Bearer token in Authorization header for all subsequent calls
- Rate limit: 300 req/min per user, 50 req/sec

## Fleet Command:
- GET /agents — All enrolled agents with status, OS, IP, versions
- GET /agents/summary/status — Active/disconnected/never connected counts
- GET /agents/summary/os — OS distribution
- GET /groups — Agent groups

## Syscollector Endpoints (per agent):
- GET /syscollector/{agent_id}/hardware — CPU, memory, architecture
- GET /syscollector/{agent_id}/os — OS details
- GET /syscollector/{agent_id}/packages — Installed software
- GET /syscollector/{agent_id}/ports — Open network ports
- GET /syscollector/{agent_id}/processes — Running processes
- GET /syscollector/{agent_id}/browser_extensions — Browser add-ons
- GET /syscollector/{agent_id}/services — System services (Windows/Linux systemd)
- GET /syscollector/{agent_id}/users — Local users and groups

## Rules & Decoders:
- GET /rules — All rules with level, groups, mitre mappings
- GET /decoders — All decoders with name, file, position

## Vulnerabilities:
- GET /vulnerability/{agent_id} — Per-agent vulnerabilities
- Indexer: wazuh-states-vulnerabilities-* for cross-agent queries

## SCA/Compliance:
- GET /sca/{agent_id} — SCA policies
- GET /sca/{agent_id}/checks/{policy_id} — SCA checks

## Syscheck/FIM:
- GET /syscheck/{agent_id} — File integrity monitoring results
- GET /syscheck/{agent_id}/last_scan — Last scan status

## MITRE:
- GET /mitre/tactics — MITRE tactics
- GET /mitre/techniques — MITRE techniques  
- GET /mitre/groups — MITRE threat groups

## Key Architecture Points from PDF:

### Vulnerability Detection (v4.7+)
- Per-agent /vulnerability/{agent_id} endpoints are DEPRECATED since v4.7
- Modern approach: Query wazuh-states-vulnerabilities-* index via Indexer API
- Use Indexer for cross-agent vulnerability aggregations, not Server API

### SOC Console Requirements:
- EPS Gauge (Events Per Second) at top
- Geographic Threat Heatmap from GeoLocation.country_name in alerts
- Threat Trends Area Chart mapping rule.level and rule.firedtimes over time
- Top Talkers Pie Chart (top agents by log count)
- MITRE ATT&CK matrix overlay from rule.mitre.tactic

### Platform Telemetry:
- GET /manager/daemons/stats — Process-specific daemon stats (analysisd, remoted, wazuh-db)
- GET /manager/stats/hourly — Historical hourly metrics
- GET /cluster/status — Cluster topology, master/worker nodes
- GET /manager/configuration/validation — ossec.conf syntax check

### Compliance:
- SCA via GET /sca/{agent_id} and GET /sca/{agent_id}/checks/{policy_id}
- Compliance tags in rules: pci_dss_*, gdpr_*, hipaa_*, nist_800_53_*, tsc_*
- Query wazuh-alerts-* filtering by these tag arrays for framework-specific dashboards

### Important: The app uses these env vars:
- WAZUH_HOST=192.168.50.213
- WAZUH_PORT=55000
- WAZUH_USER=wazuh-wui
- WAZUH_INDEXER_HOST=192.168.50.213
- WAZUH_INDEXER_PORT=9200
- WAZUH_INDEXER_USER=admin
