// raw-client.ts — the SOLE consumer of `@freemius/sdk`'s `api.__unstable_ApiClient`.
// Isolation seam (docs/specs §5, §10): an upstream change to the unstable accessor is a one-file fix.
//
// `openapi-fetch` matches on the TEMPLATE path (e.g. '/products/{product_id}/plans/{plan_id}.json'),
// not an interpolated string — so we forward { path, query, body } separately and never pre-substitute.

import type { Freemius } from '@freemius/sdk';

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

export async function rawRequest<T = unknown>(
    client: Freemius,
    method: HttpMethod,
    templatePath: string,
    args: RawRequestArgs = {}
): Promise<RawResult<T>> {
    const api = client.api.__unstable_ApiClient as unknown as OpenApiFetchLike;

    const result = await api[method](templatePath, {
        params: { path: args.path, query: args.query },
        body: args.body,
    });

    return {
        status: result.response.status,
        data: result.data as T | undefined,
        error: result.error,
    };
}
