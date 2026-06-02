// raw-client.ts — the SOLE consumer of `@freemius/sdk`'s `api.__unstable_ApiClient`.
// Isolation seam (docs/specs §5, §10): an upstream change to the unstable accessor is a one-file fix.
//
// `openapi-fetch` matches on the TEMPLATE path (e.g. '/products/{product_id}/coupons/{coupon_id}.json'),
// not an interpolated string — so we forward { path, query, body } separately and never pre-substitute.

// import type { Freemius } from '@freemius/sdk';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RawRequestArgs {
    path?: Record<string, string | number>;
    query?: Record<string, unknown>;
    body?: unknown;
}

// TODO(docs/specs §5): wrap api.__unstable_ApiClient[method](templatePath, { params: { path, query }, body }).
export async function rawRequest(
    _method: HttpMethod,
    _templatePath: string,
    _args: RawRequestArgs = {}
): Promise<never> {
    throw new Error('raw-client.rawRequest: not implemented — see docs/specs §5');
}
