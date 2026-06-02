// timeout.ts — a hard deadline for any awaited operation (review #5). A hung fetch must not block a
// CLI command or, worse, an MCP tool call (which would stall the agent indefinitely).

export const REQUEST_TIMEOUT_MS = 15_000;

export class TimeoutError extends Error {
    constructor(ms: number) {
        super(`Operation timed out after ${ms}ms`);
        this.name = 'TimeoutError';
    }
}

/** Race a promise against a deadline; rejects with TimeoutError if it does not settle in time. */
export function withTimeout<T>(promise: Promise<T>, ms: number = REQUEST_TIMEOUT_MS): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    });
    return Promise.race([promise, deadline]).finally(() => clearTimeout(timer)) as Promise<T>;
}
