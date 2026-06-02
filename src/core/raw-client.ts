// raw-client.ts — the SOLE consumer of `@freemius/sdk`'s `api.__unstable_ApiClient`.
// Isolation seam (docs/specs §5, §10): an upstream change to the unstable accessor is a one-file fix.
//
// `openapi-fetch` matches on the TEMPLATE path (e.g. '/products/{product_id}/plans/{plan_id}.json'),
// not an interpolated string — so we forward { path, query, body } separately and never pre-substitute.

import type { Freemius } from '@freemius/sdk';
import { REQUEST_TIMEOUT_MS } from './timeout.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RawRequestArgs {
    path?: Record<string, string | number>;
    query?: Record<string, unknown>;
    body?: unknown;
}

export interface RawResult<T = unknown> {
    status: number;
    data: T | undefined;
    error: unknown;
}

// openapi-fetch's typed surface is per-path; the raw escape hatch is intentionally untyped here.
type OpenApiFetchLike = Record<
    HttpMethod,
    (path: string, init: unknown) => Promise<{ data?: unknown; error?: unknown; response: Response }>
>;

export function isOkStatus(status: number): boolean {
    return status >= 200 && status < 300;
}

// The ONE place the unstable accessor is cast (review #10). openapi-fetch's typed surface is
// per-path; this raw escape hatch is intentionally untyped. Keep this the only `as unknown as`.
function unstableClient(client: Freemius): OpenApiFetchLike {
    return client.api.__unstable_ApiClient as unknown as OpenApiFetchLike;
}

export async function rawRequest<T = unknown>(
    client: Freemius,
    method: HttpMethod,
    templatePath: string,
    args: RawRequestArgs = {}
): Promise<RawResult<T>> {
    const api = unstableClient(client);

    const result = await api[method](templatePath, {
        params: { path: args.path, query: args.query },
        body: args.body,
        // Hard deadline so a hung connection can't block a CLI command or an MCP tool call (review #5).
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    return {
        status: result.response.status,
        data: result.data as T | undefined,
        error: result.error,
    };
}
