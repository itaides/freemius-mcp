import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createFreemius } from '../../src/core/freemius.js';
import { cancelSubscription } from '../../src/cli/commands/subscriptions.js';

const server = setupServer();

const fakeEnv = { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' };
const BASE = 'https://fast-api.freemius.com/v1/products/1/subscriptions';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('cancelSubscription', () => {
    it('cancels via DELETE and returns ok(result)', async () => {
        server.use(http.delete(`${BASE}/123.json`, () => HttpResponse.json({ id: 123, is_canceled: true })));

        const { client } = createFreemius({ env: fakeEnv });
        const result = await cancelSubscription(client, '123');

        expect(result).toEqual({ ok: true, data: { id: 123, is_canceled: true } });
    });

    it('reports a clear failure when the API returns no result', async () => {
        server.use(http.delete(`${BASE}/999.json`, () => new HttpResponse(null, { status: 404 })));

        const { client } = createFreemius({ env: fakeEnv });
        const result = await cancelSubscription(client, '999');

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('cancel_failed');
    });
});
