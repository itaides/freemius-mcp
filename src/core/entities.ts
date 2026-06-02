// entities.ts — data-driven, uniform reads for every curated entity (review #6/#11).
//
// ALL reads go through the raw client here, not the SDK's typed services. The SDK services swallow
// any non-2xx to `[]`/`null` (so a real failure is indistinguishable from "no rows"), and the `user`
// service additionally appends a `fields=` param that 500s on the live API. Routing every read
// through `rawRequest` (no `fields`) gives one honest `Result<T>` contract across users/plans/
// payments/subscriptions alike.

import type { Freemius } from '@freemius/sdk';
import { rawRequest, isOkStatus } from './raw-client.js';
import { ok, err, type Result } from './result.js';

/**
 * A read entity. `name` is the (plural) API path segment + list-tool name; `listKey` the array key
 * in the list response; `singular` the noun used by the `get_<singular>` MCP tool — these tool names
 * are a public contract (e.g. `get_subscription`), so the singular form is pinned explicitly.
 */
export interface EntityDef {
    name: string;
    listKey: string;
    singular: string;
}

/** The curated read surface, built once and consumed by both the CLI and the MCP tool loop. */
export const READ_ENTITIES = [
    { name: 'subscriptions', listKey: 'subscriptions', singular: 'subscription' },
    { name: 'users', listKey: 'users', singular: 'user' },
    { name: 'payments', listKey: 'payments', singular: 'payment' },
    { name: 'plans', listKey: 'plans', singular: 'plan' },
] as const satisfies readonly EntityDef[];

const MAX_COUNT = 50;

export async function getEntity<T extends { id?: unknown }>(client: Freemius, def: EntityDef, id: string): Promise<Result<T>> {
    const result = await rawRequest<T>(client, 'GET', `/products/{product_id}/${def.name}/{id}.json`, {
        path: { product_id: client.api.productId, id },
    });

    if (isOkStatus(result.status) && result.data?.id != null) {
        return ok(result.data);
    }
    if (result.status === 404 || isOkStatus(result.status)) {
        return err('not_found', `${def.name} ${id} not found`, result.status);
    }
    return err('request_failed', `request for ${def.name} ${id} failed`, result.status);
}

export async function listEntity<T>(
    client: Freemius,
    def: EntityDef,
    opts: { count?: number; offset?: number } = {}
): Promise<Result<T[]>> {
    const count = opts.count === undefined ? undefined : Math.min(opts.count, MAX_COUNT);
    const result = await rawRequest<Record<string, unknown>>(client, 'GET', `/products/{product_id}/${def.name}.json`, {
        path: { product_id: client.api.productId },
        query: { count, offset: opts.offset },
    });

    const rows = result.data?.[def.listKey];
    if (isOkStatus(result.status) && Array.isArray(rows)) {
        return ok(rows as T[]);
    }
    return err('request_failed', `request for ${def.name} list failed`, result.status);
}
