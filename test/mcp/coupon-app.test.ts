import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import { createFreemius } from '../../src/core/freemius.js';
import { registerCuratedTools } from '../../src/mcp/tools/curated.js';
import { registerCouponApp } from '../../src/mcp/ui/coupon/register.js';

const RESOURCE_URI = 'ui://freemius/coupon-form.html';

async function connectClient(): Promise<Client> {
    const { client: freemius } = createFreemius({ env: { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' } });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerCuratedTools(server, freemius, { writeEnabled: false });
    registerCouponApp(server);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
}

describe('registerCouponApp — tool integration', () => {
    it('exposes create_coupon tool with UI metadata', async () => {
        const client = await connectClient();
        const tool = (await client.listTools()).tools.find((t) => t.name === 'create_coupon');

        expect(tool).toBeDefined();
        expect((tool?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri).toBe(RESOURCE_URI);
    });
});

describe('registerCouponApp — UI resource', () => {
    it('registers the ui:// resource at the MCP Apps mime type', async () => {
        const client = await connectClient();
        const appRes = (await client.listResources()).resources.find((r) => r.uri === RESOURCE_URI);

        expect(appRes).toBeDefined();
        expect(appRes?.mimeType).toBe('text/html;profile=mcp-app');
    });

    it('serves self-contained coupon form HTML', async () => {
        const client = await connectClient();
        const read = await client.readResource({ uri: RESOURCE_URI });
        const content = read.contents[0] as { mimeType: string; text: string };

        expect(content.mimeType).toBe('text/html;profile=mcp-app');
        expect(content.text).toContain('freemius-coupon-form');
        expect(content.text.length).toBeGreaterThan(500);
    });
});
