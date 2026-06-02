// format.ts — agent-friendly output (docs/specs §5): secret redaction + a typed API error.

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

const SECRET_KEY_PATTERN = /(secret|api[_-]?key|public[_-]?key|authorization|token|password|bearer)/i;
const URL_AUTH_PARAM_PATTERN = /\b(authorization|auth_date|api_?key|token)=[^&\s]+/gi;
const REDACTED = '[redacted]';

/**
 * Recursively redact secret-shaped values so credentials never reach logs or error output
 * (docs/specs §5/§8). Redacts by key name in objects and by query-param name in URL-ish strings.
 */
export function redactSecrets<T>(value: T): T {
    if (typeof value === 'string') {
        return value.replace(URL_AUTH_PARAM_PATTERN, (_m, key: string) => `${key}=${REDACTED}`) as T;
    }
    if (Array.isArray(value)) {
        return value.map((item) => redactSecrets(item)) as T;
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value)) {
            out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redactSecrets(val);
        }
        return out as T;
    }
    return value;
}

/** Build a compact, secret-redacted error envelope for CLI/MCP output. */
export function errorEnvelope(error: unknown): { error: string; message: string } {
    const err = error instanceof Error ? error : new Error(String(error));
    return redactSecrets({ error: err.name || 'error', message: err.message });
}
