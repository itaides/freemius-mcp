import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createFreemius } from '../../src/core/freemius.js';
import { getPlan, listPlans } from '../../src/cli/commands/plans.js';

const server = setupServer();
const fakeEnv = { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' };
const BASE = 'https://fast-api.freemius.com/v1/products/1/plans';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('listPlans', () => {
    it('returns the plans array (via the raw client)', async () => {
        server.use(http.get(`${BASE}.json`, () => HttpResponse.json({ plans: [{ id: 9 }, { id: 10 }] })));

        const { client } = createFreemius({ env: fakeEnv });

        expect(await listPlans(client)).toEqual([{ id: 9 }, { id: 10 }]);
    });
});

describe('getPlan', () => {
    it('returns the plan when present', async () => {
        server.use(http.get(`${BASE}/9.json`, () => HttpResponse.json({ id: 9, name: 'Pro' })));

        const { client } = createFreemius({ env: fakeEnv });

        expect(await getPlan(client, '9')).toEqual({ found: true, data: { id: 9, name: 'Pro' } });
    });

    it('reports not-found when absent', async () => {
        server.use(http.get(`${BASE}/77.json`, () => new HttpResponse(null, { status: 404 })));

        const { client } = createFreemius({ env: fakeEnv });

        expect(await getPlan(client, '77')).toEqual({ found: false, id: '77' });
    });
});
