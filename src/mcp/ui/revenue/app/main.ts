// main.ts — the MCP Apps iframe view for revenue_summary. Bundled (target:browser) by
// scripts/build-ui.ts into a self-contained HTML string at ../generated/dashboard-html.ts.
// Vanilla DOM, no framework, no network beyond the host bridge (app.callServerTool).

import { App } from '@modelcontextprotocol/ext-apps';

interface CurrencyTotals {
    gross: number;
    refunds: number;
    net: number;
    count: number;
}

interface RevenueSummary {
    window: { from: string; to: string };
    pagesFetched: number;
    capped: boolean;
    partial?: boolean;
    byCurrency: Record<string, CurrencyTotals>;
}

const app = new App({ name: 'freemius-revenue-dashboard', version: '0.1.0' });
const root = document.getElementById('root');

function money(value: number): string {
    return value.toFixed(2);
}

function bar(label: string, value: number, max: number, cls: string): string {
    const width = (Math.abs(value) / max) * 100;
    return (
        `<div class="bar-row"><span class="bar-label">${label}</span>` +
        `<span class="bar"><span class="bar-fill ${cls}" style="width:${width}%"></span></span>` +
        `<span class="bar-val">${money(value)}</span></div>`
    );
}

function render(summary: RevenueSummary | undefined): void {
    if (!root) {
        return;
    }
    if (!summary || Object.keys(summary.byCurrency).length === 0) {
        root.innerHTML = '<p class="empty">No payments in this window.</p>';
        return;
    }
    const flags: string[] = [];
    if (summary.capped) {
        flags.push('window capped — there may be more data');
    }
    if (summary.partial) {
        flags.push('partial — a page failed mid-sweep');
    }
    const cards = Object.entries(summary.byCurrency)
        .map(([currency, totals]) => {
            const max = Math.max(totals.gross, totals.refunds, Math.abs(totals.net), 1);
            return (
                `<section class="card"><h2>${currency.toUpperCase()} <small>${totals.count} payments</small></h2>` +
                bar('Gross', totals.gross, max, 'gross') +
                bar('Refunds', totals.refunds, max, 'refunds') +
                bar('Net', totals.net, max, 'net') +
                '</section>'
            );
        })
        .join('');
    root.innerHTML =
        `<header><span class="window">${summary.window.from} → ${summary.window.to}</span></header>` +
        (flags.length ? `<p class="flags">⚠ ${flags.join(' · ')}</p>` : '') +
        `<div class="cards">${cards}</div>`;
}

// Register BEFORE connect() so the initial tool result is not missed.
app.ontoolresult = (params) => {
    render(params.structuredContent as RevenueSummary | undefined);
};

for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-days]'))) {
    btn.addEventListener('click', async () => {
        const days = Number(btn.dataset.days);
        const result = await app.callServerTool({ name: 'revenue_summary', arguments: { days } });
        render(result.structuredContent as RevenueSummary | undefined);
    });
}

void app.connect();
