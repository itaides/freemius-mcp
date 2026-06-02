import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createFreemius } from '../../src/core/freemius.js';
import { getUser, listUsers } from '../../src/cli/commands/users.js';

const server = setupServer();
const fakeEnv = { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' };
const BASE = 'https://fast-api.freemius.com/v1/products/1/users';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('getUser', () => {
    it('returns the user when present', async () => {
        server.use(http.get(`${BASE}/42.json`, () => HttpResponse.json({ id: 42, email: 'a@b.co' })));

        const { client } = createFreemius({ env: fakeEnv });

        expect(await getUser(client, '42')).toEqual({ found: true, data: { id: 42, email: 'a@b.co' } });
    });

    it('reports not-found when absent', async () => {
        server.use(http.get(`${BASE}/99.json`, () => new HttpResponse(null, { status: 404 })));

        const { client } = createFreemius({ env: fakeEnv });

        expect(await getUser(client, '99')).toEqual({ found: false, id: '99' });
    });
});

describe('listUsers', () => {
    it('returns the users array', async () => {
        server.use(http.get(`${BASE}.json`, () => HttpResponse.json({ users: [{ id: 42 }] })));

        const { client } = createFreemius({ env: fakeEnv });

        expect(await listUsers(client)).toEqual([{ id: 42 }]);
    });

    it('does not send the SDK fields param (it 500s on the live API)', async () => {
        let sawFields = false;
        server.use(
            http.get(`${BASE}.json`, ({ request }) => {
                sawFields = new URL(request.url).searchParams.has('fields');
                return HttpResponse.json({ users: [] });
            })
        );

        const { client } = createFreemius({ env: fakeEnv });
        await listUsers(client);

        expect(sawFields).toBe(false);
    });
});
