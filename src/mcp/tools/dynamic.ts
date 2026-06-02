// dynamic.ts — the dynamic trio (docs/specs §7) for full product-scope coverage at ~3 tools of cost:
//   freemius_search_tools(query)       → fuzzy match over the catalog
//   freemius_describe_tool(operationId)→ shallow-resolved, size-bounded param schema
//   freemius_execute_tool(operationId) → validate + guard (fail-closed) + run via core/execute
//
// Lands once the catalog/validator codegen (§9) exists. No-op until then.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerDynamicTools(_server: McpServer): void {
    // TODO(docs/specs §7): register search/describe/execute once catalog.ts is generated.
}
