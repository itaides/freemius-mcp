// payments command handlers (docs/specs §6). Curated reads via the SDK's typed payment service.

import type { Command } from 'commander';
import type { Freemius, PaymentEntity } from '@freemius/sdk';
import type { FreemiusContext } from '../../core/freemius.js';
import { toGetResult, type GetResult } from '../../core/reads.js';

export async function getPayment(client: Freemius, id: string): Promise<GetResult<PaymentEntity>> {
    return toGetResult(await client.api.payment.retrieve(id), id);
}

export interface ListPaymentsOptions {
    count?: number;
    offset?: number;
}

export async function listPayments(client: Freemius, options: ListPaymentsOptions = {}): Promise<PaymentEntity[]> {
    return client.api.payment.retrieveMany(undefined, { count: options.count, offset: options.offset });
}

export function registerPayments(program: Command, resolve: () => FreemiusContext): void {
    const payments = program.command('payments').description('Payment reads');

    payments
        .command('get')
        .argument('<id>', 'payment id')
        .description('Get a payment by id')
        .action(async (id: string) => {
            const result = await getPayment(resolve().client, id);

            if (!result.found) {
                console.log(JSON.stringify({ error: 'not_found', resource: 'payment', id: result.id }));
                process.exitCode = 1;
                return;
            }

            console.log(JSON.stringify(result.data, null, 2));
        });

    payments
        .command('list')
        .description('List payments')
        .option('--count <n>', 'page size (max 50)', (v) => Number.parseInt(v, 10))
        .option('--offset <n>', 'page offset', (v) => Number.parseInt(v, 10))
        .action(async (opts: ListPaymentsOptions) => {
            console.log(JSON.stringify(await listPayments(resolve().client, opts), null, 2));
        });
}
