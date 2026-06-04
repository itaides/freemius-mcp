import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createCoupon } from '../../src/cli/commands/coupons.js';
import { createFreemius } from '../../src/core/freemius.js';

const server = setupServer();
const fakeEnv = { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' };
const URL = 'https://fast-api.freemius.com/v1/products/1/coupons.json';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('createCoupon', () => {
    it('returns the created coupon on 2xx and forwards the body', async () => {
        let received: unknown;
        server.use(
            http.post(URL, async ({ request }) => {
                received = await request.json();
                return HttpResponse.json({ id: 42, code: 'SAVE20', discount: 20, discount_type: 'percentage' });
            })
        );

        const { client } = createFreemius({ env: fakeEnv });

        const result = await createCoupon(client, {
            code: 'SAVE20',
            discount: 20,
            discount_type: 'percentage',
            plans: ['9'],
        });

        expect(result).toEqual({
            ok: true,
            data: { id: 42, code: 'SAVE20', discount: 20, discount_type: 'percentage' },
        });
        expect(received).toEqual({ code: 'SAVE20', discount: 20, discount_type: 'percentage', plans: '9' });
    });

    it('omits optional fields that are not provided', async () => {
        let received: unknown;
        server.use(
            http.post(URL, async ({ request }) => {
                received = await request.json();
                return HttpResponse.json({ id: 7, code: 'TENOFF', discount: 10, discount_type: 'dollar' });
            })
        );

        const { client } = createFreemius({ env: fakeEnv });

        await createCoupon(client, { code: 'TENOFF', discount: 10, discount_type: 'dollar' });

        expect(received).toEqual({ code: 'TENOFF', discount: 10, discount_type: 'dollar' });
    });

    it('reports a clear failure on non-2xx', async () => {
        server.use(http.post(URL, () => new HttpResponse(null, { status: 422 })));

        const { client } = createFreemius({ env: fakeEnv });

        const result = await createCoupon(client, { code: 'BAD', discount: 5, discount_type: 'percentage' });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('create_failed');
            expect(result.error.status).toBe(422);
        }
    });
});
