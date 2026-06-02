import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createFreemius } from '../../src/core/freemius.js';
import { registerDynamicTools } from '../../src/mcp/tools/dynamic.js';

const msw = setupServer();
beforeAll(() => msw.listen({ onUnhandledRequest: 'error' }));
afterEach(() => msw.resetHandlers());
afterAll(() => msw.close());

async function connectClient(writeEnabled = false): Promise<Client> {
    const { client: freemius } = createFreemius({ env: { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' } });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerDynamicTools(server, freemius, { writeEnabled });

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
    return (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
}

describe('registerDynamicTools', () => {
    it('registers the trio with read-only/destructive annotations', async () => {
        const client = await connectClient();
        const tools = (await client.listTools()).tools;
        const names = tools.map((t) => t.name);

        expect(names).toContain('freemius_search_tools');
        expect(names).toContain('freemius_describe_tool');
        expect(names).toContain('freemius_execute_tool');

        expect(tools.find((t) => t.name === 'freemius_search_tools')?.annotations?.readOnlyHint).toBe(true);
        expect(tools.find((t) => t.name === 'freemius_execute_tool')?.annotations?.readOnlyHint).toBe(false);
        expect(tools.find((t) => t.name === 'freemius_execute_tool')?.annotations?.destructiveHint).toBe(true);
    });

    it('search returns product-scope matches and skips developer-scope ops', async () => {
        const client = await connectClient();
        const result = await client.callTool({ name: 'freemius_search_tools', arguments: { query: 'subscription' } });

        const rows = JSON.parse(textOf(result)) as Array<{ id: string; scope?: string }>;
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.some((r) => r.id === 'subscriptions/list')).toBe(true);
        // plans/create is developer-scope → must be excluded (it can't run).
        expect(rows.some((r) => r.id === 'plans/create')).toBe(false);
    });

    it('describe returns the catalog params for an op', async () => {
        const client = await connectClient();
        const result = await client.callTool({
            name: 'freemius_describe_tool',
            arguments: { operationId: 'subscriptions/list' },
        });

        const described = JSON.parse(textOf(result)) as { id: string; method: string; params: unknown[] };
        expect(described.id).toBe('subscriptions/list');
        expect(described.method).toBe('GET');
        expect(described.params.length).toBeGreaterThan(0);
    });

    it('execute_tool refuses a non-GET op when write mode is off', async () => {
        const client = await connectClient(false);
        const result = await client.callTool({
            name: 'freemius_execute_tool',
            arguments: { operationId: 'subscriptions/update', params: { subscription_id: 5, coupon_id: 9 } },
        });

        expect(result.isError).toBe(true);
        expect(JSON.parse(textOf(result)).error.code).toBe('write_not_allowed');
    });

    it('execute_tool runs a GET read end-to-end', async () => {
        msw.use(
            http.get('https://fast-api.freemius.com/v1/products/1/subscriptions.json', () =>
                HttpResponse.json({ subscriptions: [{ id: 7 }] })
            )
        );

        const client = await connectClient(false);
        const result = await client.callTool({
            name: 'freemius_execute_tool',
            arguments: { operationId: 'subscriptions/list' },
        });

        expect(result.isError).toBeFalsy();
        expect(JSON.parse(textOf(result))).toEqual({ subscriptions: [{ id: 7 }] });
    });
});
