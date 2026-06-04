// revenue-summary CLI command (docs/specs §7). Verifies the command reuses the shared handler and
// prints the per-currency summary on ok / an error envelope + exit 1 on a failed page.

import { Command } from 'commander';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerRevenue } from '../../src/cli/commands/revenue.js';
import { createFreemius } from '../../src/core/freemius.js';

const server = setupServer();
const fakeEnv = { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' };
const PAYMENTS = 'https://fast-api.freemius.com/v1/products/1/payments.json';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
});
afterAll(() => server.close());

function buildProgram() {
    const program = new Command();
    program.exitOverride();
    registerRevenue(program, () => createFreemius({ env: fakeEnv }));
    return program;
}

async function run(argv: string[]): Promise<{ out: string; exitCode: number | undefined }> {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => logs.push(String(m)));
    process.exitCode = 0;
    try {
        await buildProgram().parseAsync(['node', 'freemius', ...argv]);
    } finally {
        spy.mockRestore();
    }
    return { out: logs.join('\n'), exitCode: process.exitCode };
}

describe('revenue-summary command', () => {
    it('prints the per-currency summary on ok', async () => {
        server.use(
            http.get(PAYMENTS, () =>
                HttpResponse.json({ payments: [{ gross: 100, currency: 'usd', type: 'payment' }] })
            )
        );

        const { out, exitCode } = await run([
            'revenue-summary',
            '--from',
            '2026-01-01 00:00:00',
            '--to',
            '2026-04-01 00:00:00',
        ]);
        const data = JSON.parse(out);
        expect(data.byCurrency.usd).toEqual({ gross: 100, refunds: 0, net: 100, count: 1 });
        expect(exitCode).toBeFalsy();
    });

    it('prints an error envelope + exit 1 when a page fails mid-sweep', async () => {
        server.use(http.get(PAYMENTS, () => new HttpResponse(null, { status: 500 })));

        const { out, exitCode } = await run(['revenue-summary', '--from', '2026-01-01 00:00:00']);
        expect(JSON.parse(out).error.code).toBe('revenue_partial');
        expect(exitCode).toBe(1);
    });
});
