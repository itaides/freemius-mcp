import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createFreemius } from '../../src/core/freemius.js';
import { getSubscription, listSubscriptions } from '../../src/cli/commands/subscriptions.js';

const server = setupServer();

const fakeEnv = { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' };
const BASE = 'https://fast-api.freemius.com/v1/products/1/subscriptions';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('getSubscription', () => {
    it('returns the subscription when the API has it', async () => {
        server.use(http.get(`${BASE}/123.json`, () => HttpResponse.json({ id: 123, plan_id: 7 })));

        const { client } = createFreemius({ env: fakeEnv });
        const result = await getSubscription(client, '123');

        expect(result).toEqual({ found: true, subscription: { id: 123, plan_id: 7 } });
    });

    it('reports not-found clearly when the API has no such subscription', async () => {
        server.use(http.get(`${BASE}/999.json`, () => new HttpResponse(null, { status: 404 })));

        const { client } = createFreemius({ env: fakeEnv });
        const result = await getSubscription(client, '999');

        expect(result).toEqual({ found: false, id: '999' });
    });
});

describe('listSubscriptions', () => {
    it('returns the subscriptions array from the API', async () => {
        server.use(http.get(`${BASE}.json`, () => HttpResponse.json({ subscriptions: [{ id: 1 }, { id: 2 }] })));

        const { client } = createFreemius({ env: fakeEnv });
        const result = await listSubscriptions(client);

        expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });
});
