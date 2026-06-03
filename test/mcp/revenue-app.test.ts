import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createFreemius } from '../../src/core/freemius.js';
import { registerRevenueApp } from '../../src/mcp/ui/revenue/register.js';

const msw = setupServer();
beforeAll(() => msw.listen({ onUnhandledRequest: 'error' }));
afterEach(() => msw.resetHandlers());
afterAll(() => msw.close());

const RESOURCE_URI = 'ui://freemius/revenue-dashboard.html';
const WINDOW = { from: '2026-01-01 00:00:00', to: '2026-04-01 00:00:00' };

async function connectClient(): Promise<Client> {
    const { client: freemius } = createFreemius({ env: { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' } });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerRevenueApp(server, freemius);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
}

function mockPayments(): void {
    msw.use(
        http.get('https://fast-api.freemius.com/v1/products/1/payments.json', () =>
            HttpResponse.json({
                payments: [
                    { gross: 100, currency: 'usd', type: 'payment' },
                    { gross: 50, currency: 'eur', type: 'payment' },
                ],
            })
        )
    );
}

describe('registerRevenueApp — tool', () => {
    it('exposes revenue_summary read-only and advertises the UI resource', async () => {
        const client = await connectClient();
        const tool = (await client.listTools()).tools.find((t) => t.name === 'revenue_summary');

        expect(tool).toBeDefined();
        expect(tool?.annotations?.readOnlyHint).toBe(true);
        expect((tool?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri).toBe(RESOURCE_URI);
    });

    it('returns both structuredContent (for the view) and text content (fallback)', async () => {
        mockPayments();
        const client = await connectClient();
        const result = await client.callTool({ name: 'revenue_summary', arguments: WINDOW });

        expect(result.isError).toBeFalsy();

        const structured = result.structuredContent as { byCurrency: Record<string, unknown> };
        expect(structured.byCurrency.usd).toEqual({ gross: 100, refunds: 0, net: 100, count: 1 });
        expect(structured.byCurrency.eur).toEqual({ gross: 50, refunds: 0, net: 50, count: 1 });

        const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
        expect(JSON.parse(text).byCurrency.usd.net).toBe(100);
    });
});

describe('registerRevenueApp — UI resource', () => {
    it('registers the ui:// resource at the MCP Apps mime type', async () => {
        const client = await connectClient();
        const dash = (await client.listResources()).resources.find((r) => r.uri === RESOURCE_URI);

        expect(dash).toBeDefined();
        expect(dash?.mimeType).toBe('text/html;profile=mcp-app');
    });

    it('serves self-contained dashboard HTML', async () => {
        const client = await connectClient();
        const read = await client.readResource({ uri: RESOURCE_URI });
        const content = read.contents[0] as { mimeType: string; text: string };

        expect(content.mimeType).toBe('text/html;profile=mcp-app');
        expect(content.text).toContain('freemius-revenue-dashboard');
        expect(content.text.length).toBeGreaterThan(500);
    });
});
