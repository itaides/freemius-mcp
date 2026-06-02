// subscriptions command (docs/specs §6). Reads are now served by the data-driven `registerReads`
// surface (src/cli/commands/reads.ts); this module keeps ONLY the `cancel` write.
//
// `cancel` is a product-scope, DESTRUCTIVE write: it requires write mode (§7) AND a confirm echo.
// The SDK's `subscription.cancel` swallows non-2xx to `null`, so we map that to an honest
// `err('cancel_failed', …)` Result.

import type { Freemius, SubscriptionCancellationResult } from '@freemius/sdk';
import type { Command } from 'commander';
import { errorEnvelope } from '../../core/format.js';
import type { FreemiusContext } from '../../core/freemius.js';
import { assertConfirmed, assertWriteEnabled } from '../../core/guards.js';
import { err, ok, type Result } from '../../core/result.js';
import { withTimeout } from '../../core/timeout.js';
import { handledByDryRun } from '../cli-helpers.js';

export async function cancelSubscription(
    client: Freemius,
    id: string,
    options: { feedback?: string } = {}
): Promise<Result<SubscriptionCancellationResult>> {
    const result = await withTimeout(client.api.subscription.cancel(id, options.feedback));
    return result ? ok(result) : err('cancel_failed', `subscription ${id} could not be cancelled`);
}

export function registerSubscriptions(program: Command, resolve: () => FreemiusContext): void {
    // Reads register a `subscriptions` group first; attach `cancel` to it so the public command path
    // stays `subscriptions cancel <id>`. Fall back to creating the group if reads didn't run.
    const subscriptions =
        program.commands.find((c) => c.name() === 'subscriptions') ??
        program.command('subscriptions').description('Subscription reads and mutations');

    subscriptions
        .command('cancel')
        .argument('<id>', 'subscription id')
        .description('Cancel a subscription (destructive; requires --write and --confirm)')
        .option('--confirm <id>', 'echo the subscription id to confirm this destructive action')
        .option('--feedback <text>', 'optional cancellation reason')
        .action(async (id: string, opts: { confirm?: string; feedback?: string }, command: Command) => {
            if (handledByDryRun(command, { action: 'cancel_subscription', id })) {
                return;
            }
            try {
                assertWriteEnabled(Boolean(command.optsWithGlobals().write));
                assertConfirmed(id, opts.confirm);
            } catch (error) {
                console.log(JSON.stringify(errorEnvelope(error)));
                process.exitCode = 1;
                return;
            }

            const result = await cancelSubscription(resolve().client, id, { feedback: opts.feedback });

            if (!result.ok) {
                console.log(JSON.stringify({ error: result.error }));
                process.exitCode = 1;
                return;
            }

            console.log(JSON.stringify(result.data, null, 2));
        });
}
