// curated.ts — first-class named MCP tools (docs/specs §7), tight zod inputs + read-only annotations.
// They reuse the same handlers as the CLI, so behavior is identical across both surfaces.
//
// Reads are generated in a loop from READ_ENTITIES (review #6/#11): each entity gets `list_<name>`
// and `get_<name>` built on the shared `getEntity`/`listEntity` helpers. Writes stay explicit.

import type { Freemius } from '@freemius/sdk';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createCoupon } from '../../cli/commands/coupons.js';
import { cancelSubscription } from '../../cli/commands/subscriptions.js';
import { getEntity, listEntity, READ_ENTITIES } from '../../core/entities.js';
import { assertConfirmed, assertWriteEnabled } from '../../core/guards.js';
import type { ApiError, Result } from '../../core/result.js';

const listShape = {
    count: z.number().int().positive().max(50).optional().describe('page size (max 50)'),
    offset: z.number().int().nonnegative().optional().describe('page offset'),
};

function jsonResult(data: unknown): CallToolResult {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function apiErrorResult(error: ApiError): CallToolResult {
    return { content: [{ type: 'text', text: JSON.stringify({ error }) }], isError: true };
}

function resultToCall<T>(result: Result<T>): CallToolResult {
    return result.ok ? jsonResult(result.data) : apiErrorResult(result.error);
}

function errorResult(error: Error): CallToolResult {
    return {
        content: [{ type: 'text', text: JSON.stringify({ error: error.name, message: error.message }) }],
        isError: true,
    };
}

const readOnly = (title: string) => ({ title, readOnlyHint: true, openWorldHint: true });

export interface CuratedToolOptions {
    writeEnabled: boolean;
}

export function registerCuratedTools(server: McpServer, client: Freemius, options: CuratedToolOptions): void {
    for (const def of READ_ENTITIES) {
        server.registerTool(
            `list_${def.name}`,
            {
                description: `List ${def.name} for the product.`,
                inputSchema: listShape,
                annotations: readOnly(`List ${def.name}`),
            },
            async ({ count, offset }) => resultToCall(await listEntity(client, def, { count, offset }))
        );
        server.registerTool(
            `get_${def.singular}`,
            {
                description: `Get a ${def.singular} by id.`,
                inputSchema: { id: z.string().describe(`${def.singular} id`) },
                annotations: readOnly(`Get ${def.singular}`),
            },
            async ({ id }) => resultToCall(await getEntity(client, def, id))
        );
    }

    server.registerTool(
        'cancel_subscription',
        {
            description:
                'Cancel a subscription. DESTRUCTIVE. Requires write mode (FREEMIUS_MCP_ALLOW_WRITE=1) and a `confirm` arg echoing the subscription id.',
            inputSchema: {
                id: z.string().describe('subscription id'),
                confirm: z.string().optional().describe('echo the subscription id to confirm this destructive action'),
            },
            annotations: {
                title: 'Cancel subscription',
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async ({ id, confirm }) => {
            try {
                assertWriteEnabled(options.writeEnabled);
                assertConfirmed(id, confirm);
            } catch (error) {
                return errorResult(error as Error);
            }

            return resultToCall(await cancelSubscription(client, id));
        }
    );

    server.registerTool(
        'create_coupon',
        {
            description:
                'Create a coupon for the product. A write — requires write mode (FREEMIUS_MCP_ALLOW_WRITE=1). Not destructive (no confirm needed).',
            inputSchema: {
                code: z.string().describe('the coupon code'),
                discount: z.number().describe('discount amount'),
                discount_type: z.enum(['percentage', 'dollar']).describe("discount type: 'percentage' or 'dollar'"),
                plans: z.array(z.string()).optional().describe('plan ids the coupon applies to (defaults to all)'),
            },
            annotations: {
                title: 'Create coupon',
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: true,
            },
        },
        async ({ code, discount, discount_type, plans }) => {
            try {
                assertWriteEnabled(options.writeEnabled);
            } catch (error) {
                return errorResult(error as Error);
            }

            return resultToCall(await createCoupon(client, { code, discount, discount_type, plans }));
        }
    );
}
