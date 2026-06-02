// subscriptions command handlers (docs/specs §6). Curated reads use the SDK's typed service.
// Curated-error contract (§5): a missing result surfaces a clear not-found rather than a bare null.

import type { Command } from 'commander';
import type { Freemius, SubscriptionEntity } from '@freemius/sdk';
import type { FreemiusContext } from '../../core/freemius.js';

export type GetSubscriptionResult =
    | { found: true; subscription: SubscriptionEntity }
    | { found: false; id: string };

export async function getSubscription(client: Freemius, id: string): Promise<GetSubscriptionResult> {
    const subscription = await client.api.subscription.retrieve(id);

    if (!subscription) {
        return { found: false, id };
    }

    return { found: true, subscription };
}

export interface ListSubscriptionsOptions {
    count?: number;
    offset?: number;
}

export async function listSubscriptions(
    client: Freemius,
    options: ListSubscriptionsOptions = {}
): Promise<SubscriptionEntity[]> {
    return client.api.subscription.retrieveMany(undefined, { count: options.count, offset: options.offset });
}

export function registerSubscriptions(program: Command, resolve: () => FreemiusContext): void {
    const subscriptions = program.command('subscriptions').description('Subscription reads and mutations');

    subscriptions
        .command('get')
        .argument('<id>', 'subscription id')
        .description('Get a subscription by id')
        .action(async (id: string) => {
            const result = await getSubscription(resolve().client, id);

            if (!result.found) {
                console.log(JSON.stringify({ error: 'not_found', resource: 'subscription', id: result.id }));
                process.exitCode = 1;
                return;
            }

            console.log(JSON.stringify(result.subscription, null, 2));
        });

    subscriptions
        .command('list')
        .description('List subscriptions')
        .option('--count <n>', 'page size (max 50)', (v) => Number.parseInt(v, 10))
        .option('--offset <n>', 'page offset', (v) => Number.parseInt(v, 10))
        .action(async (opts: { count?: number; offset?: number }) => {
            const subs = await listSubscriptions(resolve().client, opts);
            console.log(JSON.stringify(subs, null, 2));
        });
}
