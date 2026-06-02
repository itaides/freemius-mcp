// cli-helpers.ts — shared CLI plumbing for guarded mutations.

import type { Command } from 'commander';

/**
 * Honor the global --dry-run flag for a mutating command (review #1). When set, print the planned
 * request and return true so the caller returns BEFORE touching the API. Checked before the write
 * gate so it can preview without --write — and, critically, never mutates when --dry-run is present.
 */
export function handledByDryRun(command: Command, plan: Record<string, unknown>): boolean {
    if (!command.optsWithGlobals().dryRun) {
        return false;
    }
    console.log(JSON.stringify({ dryRun: true, ...plan }, null, 2));
    return true;
}
