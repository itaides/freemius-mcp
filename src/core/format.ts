// format.ts — agent-friendly output (docs/specs §5): compact JSON, list truncation with caps,
// secret redaction, error mapping to FreemiusApiError (raw path only).

export class FreemiusApiError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly status?: number
    ) {
        super(message);
        this.name = 'FreemiusApiError';
    }
}

// TODO(docs/specs §5): redact secret-shaped values; truncate arrays with a "…(N more)" footer.
export function redactSecrets<T>(value: T): T {
    return value;
}
