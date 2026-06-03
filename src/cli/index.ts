// freemius CLI (docs/specs §6). Read commands, guarded mutations, and a generic `call` escape hatch.
// (The `#!/usr/bin/env node` shebang is added at build time by scripts/build.ts.)

import { Command } from 'commander';
import { loadProfile } from '../core/auth.js';
import { errorEnvelope } from '../core/format.js';
import { createFreemius } from '../core/freemius.js';
import { VERSION } from '../core/version.js';
import { registerCall } from './commands/call.js';
import { registerCoupons } from './commands/coupons.js';
import { registerReads } from './commands/reads.js';
import { registerSubscriptions } from './commands/subscriptions.js';

const program = new Command();

program
    .name('freemius')
    .description('Community CLI for the Freemius product API (unofficial)')
    .version(VERSION)
    .option('--product <id>', 'Freemius product id')
    .option('--profile <name>', 'config profile from ~/.config/freemius/config.json', 'default')
    .option('--write', 'enable mutating commands')
    .option('--dry-run', 'for mutations: print the planned request and exit without calling the API');

// Lazily resolve the client only when a command runs (not at --help). Honors --product and --profile,
// keeping the precedence flags > env > profile (see core/auth.ts).
const resolveContext = () => {
    const opts = program.opts<{ product?: string; profile?: string }>();
    return createFreemius({
        flags: { productId: opts.product },
        profile: loadProfile(opts.profile ?? 'default'),
    });
};

// Reads register the entity command groups (subscriptions/users/payments/plans) first; the
// subscriptions `cancel` write then attaches to the existing `subscriptions` group.
registerReads(program, resolveContext);
registerSubscriptions(program, resolveContext);
registerCoupons(program, resolveContext);
// Generic escape hatch over the full 140-op catalog (docs/specs §5).
registerCall(program, resolveContext);
// TODO(docs/specs §6): licenses, installs + `mcp`.

// Error boundary: parseAsync awaits async actions, so a thrown network/timeout error surfaces here as
// a clean, secret-redacted envelope instead of an unhandled rejection with a raw stack (review #3).
async function main(): Promise<void> {
    await program.parseAsync();
}

main().catch((error) => {
    console.error(JSON.stringify(errorEnvelope(error)));
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error(JSON.stringify(errorEnvelope(reason)));
    process.exit(1);
});
