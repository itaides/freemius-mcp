// freemius CLI (docs/specs §6). Read commands, guarded mutations, and a generic `call` escape hatch.
// (The `#!/usr/bin/env node` shebang is added at build time by scripts/build.ts.)

import { Command } from 'commander';
import { createFreemius } from '../core/freemius.js';
import { registerSubscriptions } from './commands/subscriptions.js';
import { registerUsers } from './commands/users.js';
import { registerPayments } from './commands/payments.js';
import { registerPlans } from './commands/plans.js';
import { registerCoupons } from './commands/coupons.js';

const program = new Command();

program
    .name('freemius')
    .description('Community CLI for the Freemius product API (unofficial)')
    .version('0.0.0')
    .option('--json', 'machine-readable output (default)')
    .option('--product <id>', 'Freemius product id')
    .option('--profile <name>', 'config profile')
    .option('--write', 'enable mutating commands')
    .option('--dry-run', 'show what would happen without calling the API');

// Lazily resolve the client only when a command runs (not at --help), honoring the global --product flag.
const resolveContext = () => createFreemius({ flags: { productId: program.opts().product } });

registerSubscriptions(program, resolveContext);
registerUsers(program, resolveContext);
registerPayments(program, resolveContext);
registerPlans(program, resolveContext);
registerCoupons(program, resolveContext);
// TODO(docs/specs §6): licenses, installs + `call` + `mcp`.

program.parse();
