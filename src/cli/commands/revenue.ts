// revenue-summary command (docs/specs §7). A read: bounded, client-side aggregation of payments,
// grouped by currency. Reuses the shared `revenueSummary` handler so the CLI and the MCP tool
// behave identically. On `ok` it prints the summary; on `!ok` it prints the error envelope + exit 1.

import type { Command } from 'commander';
import type { FreemiusContext } from '../../core/freemius.js';
import { revenueSummary } from '../../core/revenue.js';

export function registerRevenue(program: Command, resolve: () => FreemiusContext): void {
    program
        .command('revenue-summary')
        .description('Bounded, client-side revenue aggregation grouped by currency (last 90 days by default)')
        .option('--days <n>', 'window length in days when --from/--to are omitted (max 365)', (v) =>
            Number.parseInt(v, 10)
        )
        .option('--from <ts>', "window start, 'YYYY-MM-DD HH:mm:ss' UTC")
        .option('--to <ts>', "window end, 'YYYY-MM-DD HH:mm:ss' UTC")
        .option('--max-pages <n>', 'hard cap on pages fetched (×50 payments each)', (v) => Number.parseInt(v, 10))
        .option('--partial', 'return a labelled partial result instead of erroring if a page fails mid-sweep')
        .action(async (opts: { days?: number; from?: string; to?: string; maxPages?: number; partial?: boolean }) => {
            const result = await revenueSummary(resolve().client, {
                days: opts.days,
                from: opts.from,
                to: opts.to,
                maxPages: opts.maxPages,
                allowPartial: Boolean(opts.partial),
            });

            if (!result.ok) {
                console.log(JSON.stringify({ error: result.error }));
                process.exitCode = 1;
                return;
            }

            console.log(JSON.stringify(result.data, null, 2));
        });
}
