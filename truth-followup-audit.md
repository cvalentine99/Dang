# Truth Follow-Up — Phase 1 Audit: ID Availability at Runtime

## What IDs actually flow through the retrieval path

### Graph Sources (RetrievalSource[])

Each source has `.data` which contains the raw query results. The data structures carry IDs in these formats:

1. **searchGraph()** returns `GraphNode[]` where:
   - `node.id` = `"endpoint-${ep.id}"` (string, e.g. "endpoint-42")
   - `node.id` = `"param-${p.id}"` (string, e.g. "param-17")
   - `node.id` = `"usecase-${uc.id}"`, `"index-${idx.id}"`, `"field-${f.id}"`, `"error-${err.id}"`
   - The **numeric DB ID** is embedded in the string. Can be parsed: `parseInt(node.id.split("-")[1])`
   - Parameters also carry `properties.endpointId` (numeric) linking back to their parent endpoint

2. **getEndpoints()** returns raw endpoint rows with `ep.id` (numeric int)

3. **getRiskAnalysis()** returns `dangerousEndpoints[]` with `id` (numeric int)

4. **getResourceOverview()** returns `{ id, name, endpointCount }` with `id` (numeric int)

5. **getUseCases()** returns `{ id, ..., endpointIds: number[] | null }` — endpointIds is a JSON array of numeric IDs

6. **getErrorPatterns()** returns `{ id, ... }` with `id` (numeric int)

### What can be extracted for provenance

| Provenance Field | Source | How to Extract |
|---|---|---|
| endpointIds | searchGraph nodes with type="endpoint", getEndpoints, getRiskAnalysis | Parse numeric ID from `"endpoint-${id}"` or use `.id` directly |
| parameterIds | searchGraph nodes with type="parameter" | Parse numeric ID from `"param-${id}"` |
| docChunkIds | **No doc chunks exist in this KG architecture** | Truthfully empty — the KG has endpoints, params, responses, use cases, indices, fields, error patterns. No "doc chunks" concept. |

### Key Truth

- **endpointIds**: Extractable from graph sources. When searchGraph returns endpoint nodes, or getEndpoints/getRiskAnalysis return endpoint rows, we have real numeric IDs.
- **parameterIds**: Extractable from graph sources. When searchGraph returns parameter nodes, we have real numeric IDs.
- **docChunkIds**: **Genuinely not applicable**. The KG architecture does not have a document chunk layer. This field exists in the schema for future RAG integration but has no data source in the current pipeline. Must remain `[]` with an honest comment.

## Action Plan

1. After retrieval, scan all graph sources for endpoint and parameter IDs
2. Extract numeric IDs from GraphNode.id strings and from direct endpoint rows
3. Pass real arrays to recordProvenance()
4. Leave docChunkIds as [] with explicit comment: "No doc chunk layer in current KG architecture"
