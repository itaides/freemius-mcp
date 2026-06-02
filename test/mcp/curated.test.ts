import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createFreemius } from '../../src/core/freemius.js';
import { registerCuratedTools } from '../../src/mcp/tools/curated.js';

const msw = setupServer();
beforeAll(() => msw.listen({ onUnhandledRequest: 'error' }));
afterEach(() => msw.resetHandlers());
afterAll(() => msw.close());

async function connectClient(): Promise<Client> {
    const { client: freemius } = createFreemius({ env: { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' } });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerCuratedTools(server, freemius);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
}

describe('registerCuratedTools', () => {
    it('exposes the curated read tools as read-only', async () => {
        const client = await connectClient();
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name);

        for (const expected of ['list_subscriptions', 'get_subscription', 'list_users', 'list_payments', 'list_plans', 'get_plan']) {
            expect(names).toContain(expected);
        }

        const listPlans = tools.find((t) => t.name === 'list_plans');
        expect(listPlans?.annotations?.readOnlyHint).toBe(true);
    });

    it('runs list_plans end-to-end through the tool call', async () => {
        msw.use(
            http.get('https://fast-api.freemius.com/v1/products/1/plans.json', () =>
                HttpResponse.json({ plans: [{ id: 9, name: 'Pro' }] })
            )
        );

        const client = await connectClient();
        const result = await client.callTool({ name: 'list_plans', arguments: {} });
        const content = result.content as Array<{ type: string; text: string }>;

        expect(JSON.parse(content[0]?.text ?? 'null')).toEqual([{ id: 9, name: 'Pro' }]);
    });
});
