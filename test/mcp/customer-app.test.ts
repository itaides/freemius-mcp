import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createFreemius } from '../../src/core/freemius.js';
import { registerCuratedTools } from '../../src/mcp/tools/curated.js';
import { registerCustomerApp } from '../../src/mcp/ui/customer/register.js';

const msw = setupServer();
beforeAll(() => msw.listen({ onUnhandledRequest: 'error' }));
afterEach(() => msw.resetHandlers());
afterAll(() => msw.close());

const RESOURCE_URI = 'ui://freemius/customer-profile.html';

async function connectClient(): Promise<Client> {
    const { client: freemius } = createFreemius({ env: { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' } });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerCuratedTools(server, freemius, { writeEnabled: false });
    registerCustomerApp(server);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
}

function mockUser(): void {
    msw.use(
        http.get('https://fast-api.freemius.com/v1/products/1/users/42.json', () =>
            HttpResponse.json({
                id: 42,
                email: 'customer@example.com',
                first_name: 'Jane',
                last_name: 'Doe',
                country_code: 'US',
                created: '2026-01-01T12:00:00Z',
            })
        )
    );
}

describe('registerCustomerApp — tool integration', () => {
    it('exposes get_user tool with UI metadata pointing to customer profile', async () => {
        const client = await connectClient();
        const tool = (await client.listTools()).tools.find((t) => t.name === 'get_user');

        expect(tool).toBeDefined();
        expect((tool?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri).toBe(RESOURCE_URI);
    });

    it('returns both structuredContent (for the profile card) and text content (fallback)', async () => {
        mockUser();
        const client = await connectClient();
        const result = await client.callTool({ name: 'get_user', arguments: { id: '42' } });

        expect(result.isError).toBeFalsy();

        const structured = result.structuredContent as { id: number; email: string; first_name: string };
        expect(structured.id).toBe(42);
        expect(structured.email).toBe('customer@example.com');
        expect(structured.first_name).toBe('Jane');

        const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
        expect(JSON.parse(text).email).toBe('customer@example.com');
    });
});

describe('registerCustomerApp — UI resource', () => {
    it('registers the ui:// resource at the MCP Apps mime type', async () => {
        const client = await connectClient();
        const appRes = (await client.listResources()).resources.find((r) => r.uri === RESOURCE_URI);

        expect(appRes).toBeDefined();
        expect(appRes?.mimeType).toBe('text/html;profile=mcp-app');
    });

    it('serves self-contained customer profile HTML', async () => {
        const client = await connectClient();
        const read = await client.readResource({ uri: RESOURCE_URI });
        const content = read.contents[0] as { mimeType: string; text: string };

        expect(content.mimeType).toBe('text/html;profile=mcp-app');
        expect(content.text).toContain('freemius-customer-profile');
        expect(content.text.length).toBeGreaterThan(500);
    });
});
