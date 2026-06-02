// subscriptions command handlers (docs/specs §6). Curated reads use the SDK's typed service.
// Curated-error contract (§5): a missing result surfaces a clear not-found rather than a bare null.

import type { Command } from 'commander';
import type { Freemius, SubscriptionEntity, SubscriptionCancellationResult } from '@freemius/sdk';
import type { FreemiusContext } from '../../core/freemius.js';
import { toGetResult, type GetResult } from '../../core/reads.js';
import { assertWriteEnabled, assertConfirmed } from '../../core/guards.js';

export async function getSubscription(client: Freemius, id: string): Promise<GetResult<SubscriptionEntity>> {
    return toGetResult(await client.api.subscription.retrieve(id), id);
}

export type CancelSubscriptionResult =
    | { cancelled: true; data: SubscriptionCancellationResult }
    | { cancelled: false; id: string };

export async function cancelSubscription(
    client: Freemius,
    id: string,
    options: { feedback?: string } = {}
): Promise<CancelSubscriptionResult> {
    const result = await client.api.subscription.cancel(id, options.feedback);
    return result ? { cancelled: true, data: result } : { cancelled: false, id };
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

            console.log(JSON.stringify(result.data, null, 2));
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

    subscriptions
        .command('cancel')
        .argument('<id>', 'subscription id')
        .description('Cancel a subscription (destructive; requires --write and --confirm)')
        .option('--confirm <id>', 'echo the subscription id to confirm this destructive action')
        .option('--feedback <text>', 'optional cancellation reason')
        .action(async (id: string, opts: { confirm?: string; feedback?: string }, command: Command) => {
            try {
                assertWriteEnabled(Boolean(command.optsWithGlobals().write));
                assertConfirmed(id, opts.confirm);
            } catch (error) {
                const err = error as Error;
                console.log(JSON.stringify({ error: err.name, message: err.message }));
                process.exitCode = 1;
                return;
            }

            const result = await cancelSubscription(resolve().client, id, { feedback: opts.feedback });

            if (!result.cancelled) {
                console.log(JSON.stringify({ error: 'cancel_failed', resource: 'subscription', id: result.id }));
                process.exitCode = 1;
                return;
            }

            console.log(JSON.stringify(result.data, null, 2));
        });
}
