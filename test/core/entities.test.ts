import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type EntityDef, getEntity, listEntity } from '../../src/core/entities.js';
import { createFreemius } from '../../src/core/freemius.js';

const server = setupServer();
const fakeEnv = { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' };
const plans: EntityDef = { name: 'plans', listKey: 'plans', singular: 'plan' };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('getEntity', () => {
    it('returns ok(data) on a 2xx with an id', async () => {
        server.use(
            http.get('https://fast-api.freemius.com/v1/products/1/plans/9.json', () =>
                HttpResponse.json({ id: 9, name: 'Pro' })
            )
        );

        const { client } = createFreemius({ env: fakeEnv });
        expect(await getEntity(client, plans, '9')).toEqual({ ok: true, data: { id: 9, name: 'Pro' } });
    });

    it('returns err(not_found) on a 404', async () => {
        server.use(
            http.get(
                'https://fast-api.freemius.com/v1/products/1/plans/77.json',
                () => new HttpResponse(null, { status: 404 })
            )
        );

        const { client } = createFreemius({ env: fakeEnv });
        expect(await getEntity(client, plans, '77')).toEqual({
            ok: false,
            error: { code: 'not_found', message: 'plans 77 not found', status: 404 },
        });
    });

    it('returns err(not_found) on a 2xx without an id', async () => {
        server.use(http.get('https://fast-api.freemius.com/v1/products/1/plans/8.json', () => HttpResponse.json({})));

        const { client } = createFreemius({ env: fakeEnv });
        const result = await getEntity(client, plans, '8');
        expect(result).toEqual({ ok: false, error: { code: 'not_found', message: 'plans 8 not found', status: 200 } });
    });

    it('returns err(request_failed) on a non-404 error status', async () => {
        server.use(
            http.get(
                'https://fast-api.freemius.com/v1/products/1/plans/5.json',
                () => new HttpResponse(null, { status: 500 })
            )
        );

        const { client } = createFreemius({ env: fakeEnv });
        const result = await getEntity(client, plans, '5');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('request_failed');
            expect(result.error.status).toBe(500);
        }
    });
});

describe('listEntity', () => {
    it('returns ok(array) on a 2xx with the list key', async () => {
        server.use(
            http.get('https://fast-api.freemius.com/v1/products/1/plans.json', () =>
                HttpResponse.json({ plans: [{ id: 9 }, { id: 10 }] })
            )
        );

        const { client } = createFreemius({ env: fakeEnv });
        expect(await listEntity(client, plans)).toEqual({ ok: true, data: [{ id: 9 }, { id: 10 }] });
    });

    it('returns err(request_failed) on a non-2xx', async () => {
        server.use(
            http.get(
                'https://fast-api.freemius.com/v1/products/1/plans.json',
                () => new HttpResponse(null, { status: 500 })
            )
        );

        const { client } = createFreemius({ env: fakeEnv });
        const result = await listEntity(client, plans);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('request_failed');
    });

    it('caps count at 50 and forwards offset', async () => {
        let count: string | null = null;
        let offset: string | null = null;
        server.use(
            http.get('https://fast-api.freemius.com/v1/products/1/plans.json', ({ request }) => {
                const url = new URL(request.url);
                count = url.searchParams.get('count');
                offset = url.searchParams.get('offset');
                return HttpResponse.json({ plans: [] });
            })
        );

        const { client } = createFreemius({ env: fakeEnv });
        await listEntity(client, plans, { count: 200, offset: 10 });
        expect(count).toBe('50');
        expect(offset).toBe('10');
    });

    it('does not send a fields param (the SDK user-service 500 bug)', async () => {
        let sawFields = false;
        server.use(
            http.get('https://fast-api.freemius.com/v1/products/1/users.json', ({ request }) => {
                sawFields = new URL(request.url).searchParams.has('fields');
                return HttpResponse.json({ users: [] });
            })
        );

        const { client } = createFreemius({ env: fakeEnv });
        await listEntity(client, { name: 'users', listKey: 'users', singular: 'user' });
        expect(sawFields).toBe(false);
    });
});
