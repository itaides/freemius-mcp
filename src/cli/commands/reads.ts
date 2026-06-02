// reads.ts — one data-driven CLI surface for every curated read entity (review #6/#11).
// Builds `<name> get <id>` and `<name> list [--count --offset]` for each entry in READ_ENTITIES,
// replacing the per-entity registerUsers/registerPayments/registerPlans modules and the read half of
// subscriptions. On `ok` it prints `data`; on `!ok` it prints the error envelope and exits 1.

import type { Command } from 'commander';
import { getEntity, listEntity, READ_ENTITIES } from '../../core/entities.js';
import type { FreemiusContext } from '../../core/freemius.js';

export function registerReads(program: Command, resolve: () => FreemiusContext): void {
    for (const def of READ_ENTITIES) {
        const group = program.command(def.name).description(`${def.name} reads`);

        group
            .command('get')
            .argument('<id>', `${def.name} id`)
            .description(`Get a ${def.name} entry by id`)
            .action(async (id: string) => {
                const result = await getEntity(resolve().client, def, id);
                if (!result.ok) {
                    console.log(JSON.stringify({ error: result.error }));
                    process.exitCode = 1;
                    return;
                }
                console.log(JSON.stringify(result.data, null, 2));
            });

        group
            .command('list')
            .description(`List ${def.name}`)
            .option('--count <n>', 'page size (max 50)', (v) => Number.parseInt(v, 10))
            .option('--offset <n>', 'page offset', (v) => Number.parseInt(v, 10))
            .action(async (opts: { count?: number; offset?: number }) => {
                const result = await listEntity(resolve().client, def, opts);
                if (!result.ok) {
                    console.log(JSON.stringify({ error: result.error }));
                    process.exitCode = 1;
                    return;
                }
                console.log(JSON.stringify(result.data, null, 2));
            });
    }
}
