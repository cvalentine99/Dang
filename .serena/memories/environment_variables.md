# Environment Variables

## System (pre-configured, do not edit)
- DATABASE_URL — MySQL/TiDB connection string
- JWT_SECRET — Session cookie signing
- VITE_APP_ID — Manus OAuth app ID
- OAUTH_SERVER_URL — Manus OAuth backend
- VITE_OAUTH_PORTAL_URL — Manus login portal (frontend)
- OWNER_OPEN_ID, OWNER_NAME — Owner info
- BUILT_IN_FORGE_API_URL, BUILT_IN_FORGE_API_KEY — Manus built-in APIs (server)
- VITE_FRONTEND_FORGE_API_KEY, VITE_FRONTEND_FORGE_API_URL — Frontend APIs

## Wazuh
- WAZUH_HOST, WAZUH_PORT, WAZUH_USER, WAZUH_PASS — Wazuh REST API
- WAZUH_INDEXER_HOST, WAZUH_INDEXER_PORT, WAZUH_INDEXER_USER, WAZUH_INDEXER_PASS — OpenSearch indexer

## Integrations
- OTX_API_KEY — AlienVault OTX threat intelligence
- SPLUNK_HOST, SPLUNK_PORT, SPLUNK_HEC_PORT, SPLUNK_HEC_TOKEN — Splunk
- LLM_ENABLED, LLM_HOST, LLM_PORT, LLM_MODEL — LLM configuration

## Security
- SKIP_TLS_VERIFY — Set to true to disable TLS verification (default: false/verify)

## Access Pattern
- Server-side: import from server/_core/env.ts
- Client-side: only VITE_* prefixed variables are accessible
- Never hardcode env values in code
- All secrets managed via webdev_request_secrets