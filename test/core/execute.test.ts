// execute.test.ts — the generic catalog-driven runner (docs/specs §5). Uses REAL operationIds from
// the generated catalog so the tests track the actual API surface, msw-mocked at the fetch layer.

import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { execute } from '../../src/core/execute.js';
import { createFreemius } from '../../src/core/freemius.js';

const server = setupServer();
const fakeEnv = { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const newClient = () => createFreemius({ env: fakeEnv }).client;

describe('execute', () => {
    it('runs a GET list op and returns ok(data)', async () => {
        server.use(
            http.get('https://fast-api.freemius.com/v1/products/1/subscriptions.json', () =>
                HttpResponse.json({ subscriptions: [{ id: 1 }] })
            )
        );

        const result = await execute(newClient(), 'subscriptions/list');

        expect(result).toEqual({ ok: true, data: { subscriptions: [{ id: 1 }] } });
    });

    it('forwards query params for a GET op', async () => {
        let url: URL | undefined;
        server.use(
            http.get('https://fast-api.freemius.com/v1/products/1/subscriptions.json', ({ request }) => {
                url = new URL(request.url);
                return HttpResponse.json({ subscriptions: [] });
            })
        );

        await execute(newClient(), 'subscriptions/list', { count: 5, search: 'pro' });

        expect(url?.searchParams.get('count')).toBe('5');
        expect(url?.searchParams.get('search')).toBe('pro');
    });

    it('errors on an unknown operation', async () => {
        const result = await execute(newClient(), 'nope/missing');

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('unknown_operation');
    });

    it('refuses a developer-scope operation', async () => {
        const result = await execute(newClient(), 'plans/create', { developer_id: 7 }, { writeEnabled: true });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('scope_unsupported');
    });

    it('refuses a non-GET write when write mode is off (fail-closed)', async () => {
        const result = await execute(newClient(), 'subscriptions/update', { subscription_id: 5, coupon_id: 9 });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('write_not_allowed');
    });

    it('refuses a destructive DELETE without a matching confirm', async () => {
        const result = await execute(
            newClient(),
            'subscriptions/cancel',
            { subscription_id: 5 },
            { writeEnabled: true }
        );

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('confirmation_required');
    });

    it('runs a destructive DELETE when write mode is on and confirm matches the resource id', async () => {
        server.use(
            http.delete('https://fast-api.freemius.com/v1/products/1/subscriptions/5.json', () =>
                HttpResponse.json({ id: 5, is_canceled: true })
            )
        );

        const result = await execute(
            newClient(),
            'subscriptions/cancel',
            { subscription_id: 5 },
            { writeEnabled: true, confirm: '5' }
        );

        expect(result).toEqual({ ok: true, data: { id: 5, is_canceled: true } });
    });

    it('sends only the request-body props for a non-GET write', async () => {
        let body: unknown;
        server.use(
            http.put('https://fast-api.freemius.com/v1/products/1/subscriptions/5.json', async ({ request }) => {
                body = await request.json();
                return HttpResponse.json({ id: 5 });
            })
        );

        await execute(
            newClient(),
            'subscriptions/update',
            { subscription_id: 5, coupon_id: 9, bogus: 'drop-me' },
            { writeEnabled: true }
        );

        expect(body).toEqual({ coupon_id: 9 });
    });

    it('reports a missing required catalog param (invalid_params)', async () => {
        // installations/list-updates is a product-scope GET whose `version` query param is required:true.
        const result = await execute(newClient(), 'installations/list-updates', { install_id: 3 });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('invalid_params');
            expect(result.error.message).toContain('version');
        }
    });

    it('passes the required-param check and interpolates the path placeholder', async () => {
        let url: URL | undefined;
        server.use(
            http.get('https://fast-api.freemius.com/v1/products/1/installs/3/updates.json', ({ request }) => {
                url = new URL(request.url);
                return HttpResponse.json({ updates: [] });
            })
        );

        const result = await execute(newClient(), 'installations/list-updates', { install_id: 3, version: '1.2.0' });

        expect(result.ok).toBe(true);
        expect(url?.searchParams.get('version')).toBe('1.2.0');
    });

    it('surfaces request_failed with the status on a non-2xx', async () => {
        server.use(
            http.get('https://fast-api.freemius.com/v1/products/1/subscriptions.json', () =>
                HttpResponse.json({ error: 'nope' }, { status: 500 })
            )
        );

        const result = await execute(newClient(), 'subscriptions/list');

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('request_failed');
            expect(result.error.status).toBe(500);
        }
    });
});
