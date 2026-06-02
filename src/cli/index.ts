// freemius CLI (docs/specs §6). Read commands, guarded mutations, and a generic `call` escape hatch.
// (The `#!/usr/bin/env node` shebang is added at build time by scripts/build.ts.)

import { Command } from 'commander';

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

// TODO(docs/specs §6): register subscriptions/licenses/users/installs/payments/plans/coupons + `call` + `mcp`.

program.parse();
