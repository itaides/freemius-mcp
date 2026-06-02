import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createFreemius } from '../../src/core/freemius.js';
import { getPayment, listPayments } from '../../src/cli/commands/payments.js';

const server = setupServer();
const fakeEnv = { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' };
const BASE = 'https://fast-api.freemius.com/v1/products/1/payments';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('getPayment', () => {
    it('returns the payment when present', async () => {
        server.use(http.get(`${BASE}/55.json`, () => HttpResponse.json({ id: 55, gross: '9.99' })));

        const { client } = createFreemius({ env: fakeEnv });

        expect(await getPayment(client, '55')).toEqual({ found: true, data: { id: 55, gross: '9.99' } });
    });

    it('reports not-found when absent', async () => {
        server.use(http.get(`${BASE}/99.json`, () => new HttpResponse(null, { status: 404 })));

        const { client } = createFreemius({ env: fakeEnv });

        expect(await getPayment(client, '99')).toEqual({ found: false, id: '99' });
    });
});

describe('listPayments', () => {
    it('returns the payments array', async () => {
        server.use(http.get(`${BASE}.json`, () => HttpResponse.json({ payments: [{ id: 55 }] })));

        const { client } = createFreemius({ env: fakeEnv });

        expect(await listPayments(client)).toEqual([{ id: 55 }]);
    });
});
