// call command (docs/specs §5/§6) — the generic escape hatch over the 140-op catalog. Any operation
// the curated surface doesn't name can be run as `freemius call <operationId> --param k=v …`. It funnels
// through the shared `execute` runner, so scope/write/confirm/param safety is identical to every other
// surface. `--param` (repeatable) and `--json` are merged; `--param` wins on conflicts.

import type { Command } from 'commander';
import { execute } from '../../core/execute.js';
import { errorEnvelope } from '../../core/format.js';
import type { FreemiusContext } from '../../core/freemius.js';
import { handledByDryRun } from '../cli-helpers.js';

/** Collect a repeatable `--param key=value` flag into an object (later values win). */
export function collectParam(pair: string, acc: Record<string, string>): Record<string, string> {
    const eq = pair.indexOf('=');
    if (eq === -1) {
        throw new Error(`--param expects key=value, got '${pair}'`);
    }
    acc[pair.slice(0, eq)] = pair.slice(eq + 1);
    return acc;
}

/** Merge `--json` (parsed) with `--param` entries; `--param` overrides JSON on key conflicts. */
export function mergeParams(json: string | undefined, paramFlags: Record<string, string>): Record<string, unknown> {
    const base: Record<string, unknown> = {};
    if (json !== undefined) {
        const parsed: unknown = JSON.parse(json);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('--json must be a JSON object');
        }
        Object.assign(base, parsed);
    }
    return { ...base, ...paramFlags };
}

export function registerCall(program: Command, resolve: () => FreemiusContext): void {
    program
        .command('call')
        .argument('<operationId>', "catalog operation id, e.g. 'subscriptions/list'")
        .description('Run any catalog operation generically (writes require --write; destructive need --confirm)')
        .option('--param <key=value>', 'a request param (repeatable); --param wins over --json', collectParam, {})
        .option('--json <json>', 'a JSON object of params merged under --param')
        .option('--confirm <id>', 'echo the resource id to confirm a destructive operation')
        .action(
            async (
                operationId: string,
                opts: { param: Record<string, string>; json?: string; confirm?: string },
                command: Command
            ) => {
                let params: Record<string, unknown>;
                try {
                    params = mergeParams(opts.json, opts.param);
                } catch (error) {
                    console.log(JSON.stringify(errorEnvelope(error)));
                    process.exitCode = 1;
                    return;
                }

                if (handledByDryRun(command, { action: 'call', operationId, params })) {
                    return;
                }

                const writeEnabled = Boolean(command.optsWithGlobals().write);
                const result = await execute(resolve().client, operationId, params, {
                    writeEnabled,
                    confirm: opts.confirm,
                });

                if (!result.ok) {
                    console.log(JSON.stringify({ error: result.error }));
                    process.exitCode = 1;
                    return;
                }

                console.log(JSON.stringify(result.data, null, 2));
            }
        );
}
