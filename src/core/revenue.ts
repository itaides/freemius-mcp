// revenue.ts — bounded, client-side revenue aggregation (docs/specs §7).
//
// The API has NO analytics/MRR endpoint, so we paginate `payments.json` over an explicit, bounded
// window and aggregate gross/refunds/net PER CURRENCY. Two correctness rules are non-negotiable
// (the reasons this is not a trivial sum):
//
//   1. We DO NOT use the SDK's `iterateAll`. That ends pagination on the first short page and
//      `Payment.retrieveMany` returns `[]` on any non-2xx — so one transient failure mid-sweep is
//      indistinguishable from "no more data" and silently understates the total. Our own pager
//      distinguishes an empty SUCCESSFUL page (genuine end → stop) from a FAILED page (non-2xx →
//      refuse loudly, or return a clearly-labelled partial when `allowPartial` is set).
//   2. We never sum across currencies. Each row's `currency` keys a separate `CurrencyTotals` bucket.

import type { Freemius } from '@freemius/sdk';
import { isOkStatus, rawRequest } from './raw-client.js';
import { err, ok, type Result } from './result.js';

const PAGE_SIZE = 50;
const DEFAULT_DAYS = 90;
const MAX_DAYS = 365;
const DEFAULT_MAX_PAGES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RevenueOptions {
    /** Window start, 'YYYY-MM-DD HH:mm:ss' UTC. Default: `to` minus `days`. */
    from?: string;
    /** Window end, 'YYYY-MM-DD HH:mm:ss' UTC. Default: now. */
    to?: string;
    /** Convenience window length (days) when from/to are omitted. Default 90, clamped to 365. */
    days?: number;
    /** Hard cap on pages fetched. Default 20 (×50 = 1000 payments). */
    maxPages?: number;
    /** When true, a failed page returns a labelled partial result instead of an error. */
    allowPartial?: boolean;
}

export interface CurrencyTotals {
    gross: number;
    refunds: number;
    net: number;
    count: number;
}

export interface RevenueSummary {
    window: { from: string; to: string };
    pagesFetched: number;
    /** True when `maxPages` was hit — there may be more data (surfaced, never silent). */
    capped: boolean;
    /** Only set in allowPartial mode, after a page failed mid-sweep. */
    partial?: boolean;
    byCurrency: Record<string, CurrencyTotals>;
}

interface PaymentRow {
    gross?: number | string;
    currency?: string;
    type?: string;
}

/** Format a Date as 'YYYY-MM-DD HH:mm:ss' in UTC (the format the payments endpoint expects). */
function formatUtc(date: Date): string {
    return date.toISOString().replace('T', ' ').slice(0, 19);
}

/** Resolve the bounded window. There is NO "all time" mode — `from`/`to` are always concrete. */
function resolveWindow(opts: RevenueOptions): { from: string; to: string } {
    const to = opts.to ?? formatUtc(new Date());
    if (opts.from) {
        return { from: opts.from, to };
    }
    const days = Math.min(opts.days ?? DEFAULT_DAYS, MAX_DAYS);
    // Anchor the start off the resolved `to` so an explicit `to` still yields a `days`-long window.
    const toMs = opts.to ? Date.parse(`${opts.to.replace(' ', 'T')}Z`) : Date.now();
    return { from: formatUtc(new Date(toMs - days * DAY_MS)), to };
}

function bucket(totals: Record<string, CurrencyTotals>, currency: string): CurrencyTotals {
    const existing = totals[currency];
    if (existing) {
        return existing;
    }
    const fresh: CurrencyTotals = { gross: 0, refunds: 0, net: 0, count: 0 };
    totals[currency] = fresh;
    return fresh;
}

/** Net = gross − refunds, per currency. Run after the sweep (including before a partial return). */
function finalizeNet(totals: Record<string, CurrencyTotals>): void {
    for (const entry of Object.values(totals)) {
        entry.net = entry.gross - entry.refunds;
    }
}

/** Aggregate one page of rows into the per-currency buckets (group by currency, never across). */
function aggregate(totals: Record<string, CurrencyTotals>, rows: PaymentRow[]): void {
    for (const row of rows) {
        const currency = row.currency ?? 'unknown';
        const amount = Number(row.gross ?? 0);
        const entry = bucket(totals, currency);
        entry.count += 1;
        // Treat chargebacks like refunds; both reduce net. Take abs so a negative `gross` still adds.
        if (row.type === 'refund' || row.type === 'chargeback') {
            entry.refunds += Math.abs(amount);
        } else {
            entry.gross += amount;
        }
    }
}

export async function revenueSummary(client: Freemius, opts: RevenueOptions = {}): Promise<Result<RevenueSummary>> {
    const window = resolveWindow(opts);
    const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
    const byCurrency: Record<string, CurrencyTotals> = {};

    let pagesFetched = 0;
    let capped = false;

    for (let page = 0; page < maxPages; page += 1) {
        const offset = page * PAGE_SIZE;
        const result = await rawRequest<{ payments?: PaymentRow[] }>(
            client,
            'GET',
            '/products/{product_id}/payments.json',
            {
                path: { product_id: client.api.productId },
                query: { from: window.from, to: window.to, count: PAGE_SIZE, offset },
            }
        );

        // 1. Failed page — the FATAL trap. An SDK service would return [] and look "done"; we never do.
        if (!isOkStatus(result.status)) {
            if (opts.allowPartial) {
                finalizeNet(byCurrency);
                return ok({ window, pagesFetched, capped, partial: true, byCurrency });
            }
            return err(
                'revenue_partial',
                'a payments page failed mid-sweep; totals would be understated',
                result.status
            );
        }

        const rows = result.data?.payments ?? [];

        // 2. Empty successful page — genuine end of data, stop normally.
        if (rows.length === 0) {
            break;
        }

        aggregate(byCurrency, rows);
        pagesFetched += 1;

        // A short page is the last page.
        if (rows.length < PAGE_SIZE) {
            break;
        }
        // A full page on the final allowed iteration means there may be more — surface it.
        if (page + 1 >= maxPages) {
            capped = true;
        }
    }

    finalizeNet(byCurrency);

    return ok({ window, pagesFetched, capped, byCurrency });
}
