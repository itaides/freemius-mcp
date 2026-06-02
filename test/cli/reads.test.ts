import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Command } from 'commander';
import { createFreemius } from '../../src/core/freemius.js';
import { registerReads } from '../../src/cli/commands/reads.js';
import { READ_ENTITIES } from '../../src/core/entities.js';

const server = setupServer();
const fakeEnv = { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' };
const BASE = 'https://fast-api.freemius.com/v1/products/1';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
});
afterAll(() => server.close());

function buildProgram() {
    const program = new Command();
    program.exitOverride();
    const resolve = () => createFreemius({ env: fakeEnv });
    registerReads(program, resolve);
    return program;
}

async function run(argv: string[]): Promise<{ out: string; exitCode: number | undefined }> {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => logs.push(String(m)));
    process.exitCode = undefined;
    try {
        await buildProgram().parseAsync(['node', 'freemius', ...argv]);
    } finally {
        spy.mockRestore();
    }
    return { out: logs.join('\n'), exitCode: process.exitCode };
}

describe('registerReads — parametrized over READ_ENTITIES', () => {
    for (const def of READ_ENTITIES) {
        describe(def.name, () => {
            it(`${def.name} list prints the rows on ok`, async () => {
                server.use(http.get(`${BASE}/${def.name}.json`, () => HttpResponse.json({ [def.listKey]: [{ id: 1 }, { id: 2 }] })));

                const { out, exitCode } = await run([def.name, 'list']);
                expect(JSON.parse(out)).toEqual([{ id: 1 }, { id: 2 }]);
                expect(exitCode).toBeFalsy();
            });

            it(`${def.name} list prints an error envelope + exit 1 on failure`, async () => {
                server.use(http.get(`${BASE}/${def.name}.json`, () => new HttpResponse(null, { status: 500 })));

                const { out, exitCode } = await run([def.name, 'list']);
                expect(JSON.parse(out).error.code).toBe('request_failed');
                expect(exitCode).toBe(1);
            });

            it(`${def.name} get prints the entity on ok`, async () => {
                server.use(http.get(`${BASE}/${def.name}/7.json`, () => HttpResponse.json({ id: 7 })));

                const { out, exitCode } = await run([def.name, 'get', '7']);
                expect(JSON.parse(out)).toEqual({ id: 7 });
                expect(exitCode).toBeFalsy();
            });

            it(`${def.name} get prints not_found + exit 1 on a 404`, async () => {
                server.use(http.get(`${BASE}/${def.name}/9.json`, () => new HttpResponse(null, { status: 404 })));

                const { out, exitCode } = await run([def.name, 'get', '9']);
                expect(JSON.parse(out).error.code).toBe('not_found');
                expect(exitCode).toBe(1);
            });
        });
    }

    it('caps --count at 50', async () => {
        let count: string | null = null;
        server.use(
            http.get(`${BASE}/plans.json`, ({ request }) => {
                count = new URL(request.url).searchParams.get('count');
                return HttpResponse.json({ plans: [] });
            })
        );

        await run(['plans', 'list', '--count', '200']);
        expect(count).toBe('50');
    });
});
