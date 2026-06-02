// plans command handlers (docs/specs §6). Plans have NO SDK service, so reads go through the raw
// client (the §5 escape hatch). Read-only in v1 — plan writes are developer-scope (§3), out of scope.

import type { Command } from 'commander';
import type { Freemius } from '@freemius/sdk';
import type { FreemiusContext } from '../../core/freemius.js';
import { rawRequest, isOkStatus } from '../../core/raw-client.js';
import { toGetResult, type GetResult } from '../../core/reads.js';

export type PlanRow = { id: number | string; [key: string]: unknown };

export interface ListPlansOptions {
    count?: number;
    offset?: number;
}

export async function listPlans(client: Freemius, options: ListPlansOptions = {}): Promise<PlanRow[]> {
    const result = await rawRequest<{ plans?: PlanRow[] }>(client, 'GET', '/products/{product_id}/plans.json', {
        path: { product_id: client.api.productId },
        query: { count: options.count, offset: options.offset },
    });

    if (!isOkStatus(result.status) || !Array.isArray(result.data?.plans)) {
        return [];
    }

    return result.data.plans;
}

export async function getPlan(client: Freemius, id: string): Promise<GetResult<PlanRow>> {
    const result = await rawRequest<PlanRow>(client, 'GET', '/products/{product_id}/plans/{plan_id}.json', {
        path: { product_id: client.api.productId, plan_id: id },
    });

    const plan = isOkStatus(result.status) && result.data?.id != null ? result.data : null;

    return toGetResult(plan, id);
}

export function registerPlans(program: Command, resolve: () => FreemiusContext): void {
    const plans = program.command('plans').description('Plan reads (read-only)');

    plans
        .command('get')
        .argument('<id>', 'plan id')
        .description('Get a plan by id')
        .action(async (id: string) => {
            const result = await getPlan(resolve().client, id);

            if (!result.found) {
                console.log(JSON.stringify({ error: 'not_found', resource: 'plan', id: result.id }));
                process.exitCode = 1;
                return;
            }

            console.log(JSON.stringify(result.data, null, 2));
        });

    plans
        .command('list')
        .description('List plans')
        .option('--count <n>', 'page size (max 50)', (v) => Number.parseInt(v, 10))
        .option('--offset <n>', 'page offset', (v) => Number.parseInt(v, 10))
        .action(async (opts: ListPlansOptions) => {
            console.log(JSON.stringify(await listPlans(resolve().client, opts), null, 2));
        });
}
