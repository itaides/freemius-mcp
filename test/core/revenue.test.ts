// revenue.test.ts — bounded, client-side revenue aggregation (spec §7).
//
// Two correctness rules under test (the FATAL traps the design exists to prevent):
//   1. A failed page mid-sweep must NOT be treated as end-of-data (would silently understate totals).
//   2. Totals are grouped BY CURRENCY, never collapsed into a single cross-currency scalar.
//
// All windows are passed explicitly (from/to) so the assertions are deterministic regardless of `now`.

import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createFreemius } from '../../src/core/freemius.js';
import { revenueSummary } from '../../src/core/revenue.js';

const server = setupServer();
const PAYMENTS = 'https://fast-api.freemius.com/v1/products/1/payments.json';
const WINDOW = { from: '2026-01-01 00:00:00', to: '2026-04-01 00:00:00' };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function freemius() {
    return createFreemius({ env: { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' } }).client;
}

/** Build N payment rows of one currency/type, each `gross` dollars. */
function rows(n: number, gross: number, currency = 'usd', type = 'payment') {
    return Array.from({ length: n }, () => ({ gross, currency, type, created: '2026-02-01 00:00:00' }));
}

/** Reply to a page keyed by the `offset` query param, from a map of offset → payments array. */
function pager(pages: Record<number, unknown[] | number>) {
    return http.get(PAYMENTS, ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get('offset') ?? '0');
        const page = pages[offset];
        if (typeof page === 'number') {
            return new HttpResponse(null, { status: page });
        }
        return HttpResponse.json({ payments: page ?? [] });
    });
}

describe('revenueSummary', () => {
    it('paginates until a short page and totals correctly', async () => {
        server.use(pager({ 0: rows(50, 10), 50: rows(10, 10) }));

        const result = await revenueSummary(freemius(), WINDOW);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.data.pagesFetched).toBe(2);
        expect(result.data.capped).toBe(false);
        expect(result.data.byCurrency.usd).toEqual({ gross: 600, refunds: 0, net: 600, count: 60 });
    });

    it('groups by currency and never sums across them', async () => {
        const mixed = [...rows(2, 100, 'usd'), ...rows(3, 50, 'eur')];
        server.use(pager({ 0: mixed }));

        const result = await revenueSummary(freemius(), WINDOW);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(Object.keys(result.data.byCurrency).sort()).toEqual(['eur', 'usd']);
        expect(result.data.byCurrency.usd).toEqual({ gross: 200, refunds: 0, net: 200, count: 2 });
        expect(result.data.byCurrency.eur).toEqual({ gross: 150, refunds: 0, net: 150, count: 3 });
    });

    it('subtracts refunds from net (refund gross is taken absolute)', async () => {
        const page = [...rows(3, 100, 'usd'), ...rows(1, -30, 'usd', 'refund')];
        server.use(pager({ 0: page }));

        const result = await revenueSummary(freemius(), WINDOW);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.data.byCurrency.usd).toEqual({ gross: 300, refunds: 30, net: 270, count: 4 });
    });

    it('treats a failed page mid-sweep as an error, NOT end-of-data (default)', async () => {
        // page 0 is a full successful page; page 1 (offset 50) 500s. The SDK service would return []
        // here and look "done" — we must refuse with revenue_partial instead.
        server.use(pager({ 0: rows(50, 10), 50: 500 }));

        const result = await revenueSummary(freemius(), WINDOW);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.code).toBe('revenue_partial');
        expect(result.error.status).toBe(500);
    });

    it('returns a labelled partial result when allowPartial is set', async () => {
        server.use(pager({ 0: rows(50, 10), 50: 500 }));

        const result = await revenueSummary(freemius(), { ...WINDOW, allowPartial: true });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.data.partial).toBe(true);
        expect(result.data.pagesFetched).toBe(1);
        // Only page 0 totals are present — never the (missing) page 1 silently dropped.
        expect(result.data.byCurrency.usd).toEqual({ gross: 500, refunds: 0, net: 500, count: 50 });
    });

    it('flags capped when maxPages is reached with a full page', async () => {
        server.use(pager({ 0: rows(50, 10), 50: rows(50, 10) }));

        const result = await revenueSummary(freemius(), { ...WINDOW, maxPages: 1 });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.data.capped).toBe(true);
        expect(result.data.pagesFetched).toBe(1);
        expect(result.data.byCurrency.usd).toEqual({ gross: 500, refunds: 0, net: 500, count: 50 });
    });

    it('stops normally on an empty successful page', async () => {
        server.use(pager({ 0: [] }));

        const result = await revenueSummary(freemius(), WINDOW);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // An empty successful page is end-of-data, not a page of revenue: nothing aggregated.
        expect(result.data.pagesFetched).toBe(0);
        expect(result.data.byCurrency).toEqual({});
    });
});
