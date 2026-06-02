import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createFreemius } from '../../src/core/freemius.js';
import { rawRequest } from '../../src/core/raw-client.js';

const server = setupServer();
const fakeEnv = { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('rawRequest', () => {
    it('forwards a templated GET with path + query params and returns status + data', async () => {
        server.use(
            http.get('https://fast-api.freemius.com/v1/products/1/plans.json', ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('count')).toBe('3');
                return HttpResponse.json({ plans: [{ id: 9 }] });
            })
        );

        const { client } = createFreemius({ env: fakeEnv });
        const result = await rawRequest(client, 'GET', '/products/{product_id}/plans.json', {
            path: { product_id: '1' },
            query: { count: 3 },
        });

        expect(result.status).toBe(200);
        expect(result.data).toEqual({ plans: [{ id: 9 }] });
    });

    it('surfaces non-2xx status without throwing', async () => {
        server.use(
            http.get('https://fast-api.freemius.com/v1/products/1/plans/77.json', () =>
                HttpResponse.json({ error: { code: 'not_found', message: 'nope' } }, { status: 404 })
            )
        );

        const { client } = createFreemius({ env: fakeEnv });
        const result = await rawRequest(client, 'GET', '/products/{product_id}/plans/{plan_id}.json', {
            path: { product_id: '1', plan_id: '77' },
        });

        expect(result.status).toBe(404);
    });
});
