// register.ts — the "apps layer": the revenue_summary tool upgraded with an MCP Apps UI, plus the
// ui:// resource that serves the dashboard. Progressive enhancement — hosts without UI support ignore
// _meta.ui and render the text content. Reuses core/revenue.ts unchanged.

import type { Freemius } from '@freemius/sdk';
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { revenueSummary } from '../../../core/revenue.js';
import { apiErrorResult } from '../../tools/curated.js';
import { revenueDashboardHtml } from './generated/dashboard-html.js';

const RESOURCE_URI = 'ui://freemius/revenue-dashboard.html';

const currencyTotals = z.object({
    gross: z.number(),
    refunds: z.number(),
    net: z.number(),
    count: z.number(),
});

// outputSchema mirrors core/revenue.ts RevenueSummary so hosts can validate structuredContent.
const revenueOutputSchema = {
    window: z.object({ from: z.string(), to: z.string() }),
    pagesFetched: z.number(),
    capped: z.boolean(),
    partial: z.boolean().optional(),
    byCurrency: z.record(z.string(), currencyTotals),
};

export function registerRevenueApp(server: McpServer, client: Freemius): void {
    registerAppTool(
        server,
        'revenue_summary',
        {
            title: 'Revenue summary',
            description:
                'Bounded, client-side revenue aggregation (gross/refunds/net) grouped by currency over a date window (default last 90 days). Renders an interactive dashboard in hosts that support MCP Apps; falls back to text elsewhere. Not an analytics endpoint — for full reporting use the Freemius dashboard.',
            inputSchema: {
                days: z
                    .number()
                    .int()
                    .positive()
                    .max(365)
                    .optional()
                    .describe('window length in days when from/to are omitted (default 90, max 365)'),
                from: z.string().optional().describe("window start, 'YYYY-MM-DD HH:mm:ss' UTC"),
                to: z.string().optional().describe("window end, 'YYYY-MM-DD HH:mm:ss' UTC"),
            },
            outputSchema: revenueOutputSchema,
            annotations: { title: 'Revenue summary', readOnlyHint: true, openWorldHint: true },
            _meta: { ui: { resourceUri: RESOURCE_URI } },
        },
        // biome-ignore lint/suspicious/noExplicitAny: SDK version mismatch necessitates any
        async ({ days, from, to }): Promise<any> => {
            const result = await revenueSummary(client, { days, from, to });
            if (!result.ok) {
                return apiErrorResult(result.error);
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
                structuredContent: result.data,
            };
        }
    );

    registerAppResource(
        server,
        'Revenue Dashboard',
        RESOURCE_URI,
        { description: 'Interactive per-currency revenue dashboard for revenue_summary.' },
        async () => ({
            contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: revenueDashboardHtml }],
        })
    );
}
