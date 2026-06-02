// curated.ts — first-class named MCP tools (docs/specs §7), tight zod inputs + read-only annotations.
// They reuse the same handlers as the CLI, so behavior is identical across both surfaces.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Freemius } from '@freemius/sdk';
import type { GetResult } from '../../core/reads.js';
import { getSubscription, listSubscriptions } from '../../cli/commands/subscriptions.js';
import { getUser, listUsers } from '../../cli/commands/users.js';
import { getPayment, listPayments } from '../../cli/commands/payments.js';
import { getPlan, listPlans } from '../../cli/commands/plans.js';

const listShape = {
    count: z.number().int().positive().max(50).optional().describe('page size (max 50)'),
    offset: z.number().int().nonnegative().optional().describe('page offset'),
};

function idShape(resource: string) {
    return { id: z.string().describe(`${resource} id`) };
}

function jsonResult(data: unknown): CallToolResult {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function getResult<T>(result: GetResult<T>, resource: string): CallToolResult {
    if (!result.found) {
        return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'not_found', resource, id: result.id }) }],
            isError: true,
        };
    }
    return jsonResult(result.data);
}

const readOnly = (title: string) => ({ title, readOnlyHint: true, openWorldHint: true });

export function registerCuratedTools(server: McpServer, client: Freemius): void {
    server.registerTool(
        'list_subscriptions',
        { description: 'List subscriptions for the product.', inputSchema: listShape, annotations: readOnly('List subscriptions') },
        async ({ count, offset }) => jsonResult(await listSubscriptions(client, { count, offset }))
    );
    server.registerTool(
        'get_subscription',
        { description: 'Get a subscription by id.', inputSchema: idShape('subscription'), annotations: readOnly('Get subscription') },
        async ({ id }) => getResult(await getSubscription(client, id), 'subscription')
    );

    server.registerTool(
        'list_users',
        { description: 'List users for the product.', inputSchema: listShape, annotations: readOnly('List users') },
        async ({ count, offset }) => jsonResult(await listUsers(client, { count, offset }))
    );
    server.registerTool(
        'get_user',
        { description: 'Get a user by id.', inputSchema: idShape('user'), annotations: readOnly('Get user') },
        async ({ id }) => getResult(await getUser(client, id), 'user')
    );

    server.registerTool(
        'list_payments',
        { description: 'List payments for the product.', inputSchema: listShape, annotations: readOnly('List payments') },
        async ({ count, offset }) => jsonResult(await listPayments(client, { count, offset }))
    );
    server.registerTool(
        'get_payment',
        { description: 'Get a payment by id.', inputSchema: idShape('payment'), annotations: readOnly('Get payment') },
        async ({ id }) => getResult(await getPayment(client, id), 'payment')
    );

    server.registerTool(
        'list_plans',
        { description: 'List the product pricing plans.', inputSchema: listShape, annotations: readOnly('List plans') },
        async ({ count, offset }) => jsonResult(await listPlans(client, { count, offset }))
    );
    server.registerTool(
        'get_plan',
        { description: 'Get a plan by id.', inputSchema: idShape('plan'), annotations: readOnly('Get plan') },
        async ({ id }) => getResult(await getPlan(client, id), 'plan')
    );
}
