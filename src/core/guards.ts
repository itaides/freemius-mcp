// guards.ts — write/destructive gating (docs/specs §7). Fail-closed: writes are refused unless
// write-mode is explicitly enabled, and destructive ops additionally require a confirm echo.
//
// Honest about scope (§7): the confirm echo guards against a fat-fingered human, NOT against a
// prompt-injected agent that can read the id from a prior list_* call. Real protection for
// irreversible actions is a human in the loop (CLI-first); this is the second, cheap layer.

export class WriteNotAllowedError extends Error {
    constructor(message = 'Write mode is off. Enable it with FREEMIUS_MCP_ALLOW_WRITE=1 (MCP) or --write (CLI).') {
        super(message);
        this.name = 'WriteNotAllowedError';
    }
}

export class ConfirmationRequiredError extends Error {
    constructor(public readonly targetId: string) {
        super(`Destructive action requires confirmation. Re-run with confirm="${targetId}".`);
        this.name = 'ConfirmationRequiredError';
    }
}

/** Refuse any write unless write-mode is explicitly on. */
export function assertWriteEnabled(writeEnabled: boolean): void {
    if (!writeEnabled) {
        throw new WriteNotAllowedError();
    }
}

/** Require the caller to echo the target id before a destructive action proceeds. */
export function assertConfirmed(targetId: string, confirm: string | undefined): void {
    if (confirm !== targetId) {
        throw new ConfirmationRequiredError(targetId);
    }
}
