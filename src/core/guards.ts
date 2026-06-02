// guards.ts — write/destructive gating (docs/specs §7). Fail-closed: any op not on the read-only
// allowlist is treated as a write and refused unless write-mode is on.

import type { CatalogEntry } from './catalog.js';

export interface GuardContext {
    /** FREEMIUS_MCP_ALLOW_WRITE=1 or --write */
    writeEnabled: boolean;
    /** echo of the target id for destructive ops (fat-finger guard only — see §7) */
    confirm?: string;
}

export class GuardError extends Error {}

// TODO(docs/specs §7): refuse non-`safe` ops without write-mode; require `confirm` for destructive.
export function assertAllowed(_op: CatalogEntry, _ctx: GuardContext): void {
    throw new Error('guards.assertAllowed: not implemented — see docs/specs §7');
}
