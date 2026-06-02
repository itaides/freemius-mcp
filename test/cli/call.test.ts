import { Command } from 'commander';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { collectParam, mergeParams, registerCall } from '../../src/cli/commands/call.js';
import { createFreemius } from '../../src/core/freemius.js';

const server = setupServer();
const fakeEnv = { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
    process.exitCode = 0;
});
afterAll(() => server.close());

// Build a program with the global flags the real CLI exposes, then attach `call`.
function buildProgram() {
    const program = new Command();
    program
        .option('--write', 'enable mutating commands')
        .option('--dry-run', 'print the planned request and exit')
        .exitOverride();
    registerCall(program, () => createFreemius({ env: fakeEnv }));
    return program;
}

describe('collectParam / mergeParams', () => {
    it('collects repeatable key=value into an object', () => {
        const acc = {};
        collectParam('a=1', acc);
        collectParam('b=two', acc);
        expect(acc).toEqual({ a: '1', b: 'two' });
    });

    it('throws on a param without =', () => {
        expect(() => collectParam('oops', {})).toThrow();
    });

    it('merges --json under --param (param wins)', () => {
        expect(mergeParams('{"a":1,"b":2}', { b: '9', c: '3' })).toEqual({ a: 1, b: '9', c: '3' });
    });

    it('rejects non-object --json', () => {
        expect(() => mergeParams('[1,2]', {})).toThrow();
    });
});

describe('freemius call', () => {
    it('runs a GET op and prints the data', async () => {
        server.use(
            http.get('https://fast-api.freemius.com/v1/products/1/subscriptions.json', () =>
                HttpResponse.json({ subscriptions: [{ id: 1 }] })
            )
        );
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});

        await buildProgram().parseAsync(['call', 'subscriptions/list'], { from: 'user' });

        expect(process.exitCode).toBeFalsy();
        expect(JSON.parse(log.mock.calls.at(-1)?.[0] as string)).toEqual({ subscriptions: [{ id: 1 }] });
    });

    it('refuses a write without --write and exits 1', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});

        await buildProgram().parseAsync(['call', 'subscriptions/update', '--param', 'subscription_id=5'], {
            from: 'user',
        });

        expect(process.exitCode).toBe(1);
        expect(JSON.parse(log.mock.calls.at(-1)?.[0] as string).error.code).toBe('write_not_allowed');
    });

    it('previews with --dry-run without calling the API', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});

        await buildProgram().parseAsync(
            ['--dry-run', 'call', 'subscriptions/list', '--param', 'count=5', '--json', '{"search":"pro"}'],
            { from: 'user' }
        );

        const printed = JSON.parse(log.mock.calls.at(-1)?.[0] as string);
        expect(printed.dryRun).toBe(true);
        expect(printed.action).toBe('call');
        expect(printed.params).toEqual({ search: 'pro', count: '5' });
    });
});
