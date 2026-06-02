// dynamic.ts — the catalog-driven long-tail MCP surface (docs/specs §5/§7). Three meta-tools let an
// agent discover and run any of the ~140 catalog operations the curated tools don't name first-class:
//   freemius_search_tools   — fuzzy/substring discovery over id + summary (product-scope only)
//   freemius_describe_tool  — the catalog entry's shape (params + body props) for a single op
//   freemius_execute_tool   — run an op through the shared `execute` runner (same safety as the CLI)
//
// search/describe are read-only; execute can run DELETEs, so it carries destructive/open-world hints.
// It reuses the SAME `execute` runner as `freemius call`, so scope/write/confirm/param safety is shared.

import type { Freemius } from '@freemius/sdk';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { catalog } from '../../core/catalog.js';
import { execute, findOperation } from '../../core/execute.js';
import { jsonResult, resultToCall } from './curated.js';

// Cap search output so a broad query can't return a 140-row wall of text to the model.
const MAX_RESULTS = 25;

// Only product-scope ops are runnable in v1; developer/other ops can't execute, so they're not even
// discoverable via search (showing them would invite calls that always fail scope_unsupported).
const RUNNABLE = catalog.filter((op) => op.scope === 'product');

export interface DynamicToolOptions {
    writeEnabled: boolean;
}

export function registerDynamicTools(server: McpServer, client: Freemius, options: DynamicToolOptions): void {
    server.registerTool(
        'freemius_search_tools',
        {
            description:
                'Search the Freemius operation catalog by keyword (matches operation id + summary). Returns a compact list of runnable, product-scope operations to use with freemius_describe_tool / freemius_execute_tool.',
            inputSchema: { query: z.string().describe('keyword(s) to match against operation id and summary') },
            annotations: { title: 'Search operations', readOnlyHint: true, openWorldHint: true },
        },
        async ({ query }) => {
            const needle = query.trim().toLowerCase();
            const matches = RUNNABLE.filter(
                (op) => op.id.toLowerCase().includes(needle) || op.summary.toLowerCase().includes(needle)
            )
                .slice(0, MAX_RESULTS)
                .map((op) => ({
                    id: op.id,
                    method: op.method,
                    summary: op.summary,
                    safe: op.safe,
                    destructive: op.destructive,
                }));
            return jsonResult(matches);
        }
    );

    server.registerTool(
        'freemius_describe_tool',
        {
            description:
                'Describe a single Freemius operation: its method, scope, summary, params, and request-body property names — everything needed to build a freemius_execute_tool call.',
            inputSchema: { operationId: z.string().describe("catalog operation id, e.g. 'subscriptions/list'") },
            annotations: { title: 'Describe operation', readOnlyHint: true, openWorldHint: true },
        },
        async ({ operationId }) => {
            const op = findOperation(operationId);
            if (!op) {
                return jsonResult({ error: { code: 'unknown_operation', message: `no operation '${operationId}'` } });
            }
            return jsonResult({
                id: op.id,
                method: op.method,
                scope: op.scope,
                summary: op.summary,
                params: op.params,
                requestBodyProps: op.requestBodyProps,
            });
        }
    );

    server.registerTool(
        'freemius_execute_tool',
        {
            description:
                'Run any catalog operation generically. Writes require write mode (FREEMIUS_MCP_ALLOW_WRITE=1); destructive operations also require `confirm` echoing the resource id. Prefer the curated named tools when one exists.',
            inputSchema: {
                operationId: z.string().describe("catalog operation id, e.g. 'subscriptions/cancel'"),
                params: z.record(z.string(), z.unknown()).optional().describe('path/query/body params for the op'),
                confirm: z.string().optional().describe('echo the resource id to confirm a destructive operation'),
            },
            annotations: {
                title: 'Execute operation',
                readOnlyHint: false,
                destructiveHint: true,
                openWorldHint: true,
            },
        },
        async ({ operationId, params, confirm }) =>
            resultToCall(
                await execute(client, operationId, params ?? {}, { writeEnabled: options.writeEnabled, confirm })
            )
    );
}
