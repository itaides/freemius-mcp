import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createFreemius } from '../../src/core/freemius.js';
import { registerCuratedTools } from '../../src/mcp/tools/curated.js';

const msw = setupServer();
beforeAll(() => msw.listen({ onUnhandledRequest: 'error' }));
afterEach(() => msw.resetHandlers());
afterAll(() => msw.close());

async function connectClient(writeEnabled = false): Promise<Client> {
    const { client: freemius } = createFreemius({ env: { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' } });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerCuratedTools(server, freemius, { writeEnabled });

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
    return (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
}

describe('registerCuratedTools', () => {
    it('exposes the curated read tools as read-only', async () => {
        const client = await connectClient();
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name);

        for (const expected of [
            'list_subscriptions',
            'get_subscription',
            'list_users',
            'list_payments',
            'list_plans',
            'get_plan',
        ]) {
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

        expect(JSON.parse(textOf(result) || 'null')).toEqual([{ id: 9, name: 'Pro' }]);
    });
});

describe('revenue_summary (read-only)', () => {
    it('is exposed as a read-only tool', async () => {
        const client = await connectClient();
        const tools = (await client.listTools()).tools;
        const revenue = tools.find((t) => t.name === 'revenue_summary');

        expect(revenue).toBeDefined();
        expect(revenue?.annotations?.readOnlyHint).toBe(true);
    });

    it('aggregates payments by currency through the tool call', async () => {
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

        const client = await connectClient();
        const result = await client.callTool({
            name: 'revenue_summary',
            arguments: { from: '2026-01-01 00:00:00', to: '2026-04-01 00:00:00' },
        });

        expect(result.isError).toBeFalsy();
        const data = JSON.parse(textOf(result));
        expect(data.byCurrency.usd).toEqual({ gross: 100, refunds: 0, net: 100, count: 1 });
        expect(data.byCurrency.eur).toEqual({ gross: 50, refunds: 0, net: 50, count: 1 });
    });
});

describe('cancel_subscription (write gate)', () => {
    it('is present and annotated destructive', async () => {
        const client = await connectClient(false);
        const tools = (await client.listTools()).tools;
        const cancel = tools.find((t) => t.name === 'cancel_subscription');

        expect(cancel).toBeDefined();
        expect(cancel?.annotations?.destructiveHint).toBe(true);
        expect(cancel?.annotations?.readOnlyHint).toBe(false);
    });

    it('is refused when write mode is off (fail-closed)', async () => {
        const client = await connectClient(false);
        const result = await client.callTool({ name: 'cancel_subscription', arguments: { id: '5', confirm: '5' } });

        expect(result.isError).toBe(true);
        expect(JSON.parse(textOf(result)).error).toBe('WriteNotAllowedError');
    });

    it('requires a matching confirm even with write mode on', async () => {
        const client = await connectClient(true);
        const result = await client.callTool({ name: 'cancel_subscription', arguments: { id: '5' } });

        expect(result.isError).toBe(true);
        expect(JSON.parse(textOf(result)).error).toBe('ConfirmationRequiredError');
    });

    it('cancels when write mode is on and confirm matches', async () => {
        msw.use(
            http.delete('https://fast-api.freemius.com/v1/products/1/subscriptions/5.json', () =>
                HttpResponse.json({ id: 5, is_canceled: true })
            )
        );

        const client = await connectClient(true);
        const result = await client.callTool({ name: 'cancel_subscription', arguments: { id: '5', confirm: '5' } });

        expect(result.isError).toBeFalsy();
        expect(JSON.parse(textOf(result))).toEqual({ id: 5, is_canceled: true });
    });
});

describe('create_coupon (write gate)', () => {
    it('is present and annotated non-destructive', async () => {
        const client = await connectClient(false);
        const tools = (await client.listTools()).tools;
        const create = tools.find((t) => t.name === 'create_coupon');

        expect(create).toBeDefined();
        expect(create?.annotations?.readOnlyHint).toBe(false);
        expect(create?.annotations?.destructiveHint).toBe(false);
    });

    it('is refused when write mode is off (fail-closed)', async () => {
        const client = await connectClient(false);
        const result = await client.callTool({
            name: 'create_coupon',
            arguments: { code: 'SAVE20', discount: 20, discount_type: 'percentage' },
        });

        expect(result.isError).toBe(true);
        expect(JSON.parse(textOf(result)).error).toBe('WriteNotAllowedError');
    });

    it('creates when write mode is on', async () => {
        msw.use(
            http.post('https://fast-api.freemius.com/v1/products/1/coupons.json', () =>
                HttpResponse.json({ id: 42, code: 'SAVE20', discount: 20, discount_type: 'percentage' })
            )
        );

        const client = await connectClient(true);
        const result = await client.callTool({
            name: 'create_coupon',
            arguments: { code: 'SAVE20', discount: 20, discount_type: 'percentage' },
        });

        expect(result.isError).toBeFalsy();
        expect(JSON.parse(textOf(result))).toEqual({
            id: 42,
            code: 'SAVE20',
            discount: 20,
            discount_type: 'percentage',
        });
    });
});
