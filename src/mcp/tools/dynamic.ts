// dynamic.ts — the dynamic trio (docs/specs §7) for full product-scope coverage at ~3 tools of cost:
//   freemius_search_tools(query)       → fuzzy match over the catalog
//   freemius_describe_tool(operationId)→ shallow-resolved, size-bounded param schema
//   freemius_execute_tool(operationId) → validate + guard (fail-closed) + run via core/execute

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolOptions } from './curated.js';

// TODO(docs/specs §7): register the three dynamic tools; execute_tool is the narrow, guarded escape hatch.
export function registerDynamicTools(_server: McpServer, _opts: ToolOptions): void {
    // not implemented yet
}
