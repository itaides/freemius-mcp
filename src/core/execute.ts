// execute.ts — the generic, catalog-driven runner behind the long-tail surface (docs/specs §5).
// Both the CLI `call` command and the dynamic MCP `freemius_execute_tool` funnel through here, so the
// safety model (scope check → fail-closed write gate → destructive confirm → param presence) is
// enforced in exactly ONE place. It never throws: every refusal/failure is mapped to an `err(...)`.

import type { Freemius } from '@freemius/sdk';
import { catalog } from './catalog.js';
import type { CatalogEntry } from './catalog-types.js';
import { isOkStatus, rawRequest } from './raw-client.js';
import { err, ok, type Result } from './result.js';

export interface ExecuteContext {
    writeEnabled: boolean;
    confirm?: string;
}

// Index the catalog once at module load — operationId → entry. The catalog is a frozen, generated
// constant, so a module-level Map is safe and avoids re-scanning 140 ops on every call.
const INDEX: Map<string, CatalogEntry> = new Map(catalog.map((op) => [op.id, op]));

/** Return the catalog entry for an operationId (or undefined). Exposed for describe/search reuse. */
export function findOperation(operationId: string): CatalogEntry | undefined {
    return INDEX.get(operationId);
}

/** The `{placeholder}` tokens in a template path, in order (e.g. ['product_id','subscription_id']). */
function pathPlaceholders(templatePath: string): string[] {
    return [...templatePath.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? '').filter((name) => name !== '');
}

/**
 * The resource id a destructive op acts on: the LAST path placeholder that is not `product_id`
 * (e.g. `subscription_id` for `/products/{product_id}/subscriptions/{subscription_id}.json`).
 * Path placeholders come from the templatePath because the generated catalog only lists a handful of
 * path params in `op.params` — the rest live solely in the template.
 */
function destructiveTargetKey(op: CatalogEntry): string | undefined {
    const ids = pathPlaceholders(op.templatePath).filter((name) => name !== 'product_id');
    return ids.at(-1);
}

export async function execute(
    client: Freemius,
    operationId: string,
    params: Record<string, unknown> = {},
    ctx?: ExecuteContext
): Promise<Result<unknown>> {
    const op = INDEX.get(operationId);
    if (!op) {
        return err('unknown_operation', `no operation '${operationId}'`);
    }

    // 1. Scope: only product-scope ops are Bearer-reachable in v1 (developer/other need login/2FA).
    if (op.scope !== 'product') {
        return err('scope_unsupported', 'developer/other-scope operations are not supported in v1');
    }

    // 2. Fail-closed write gate (direct checks, not the throwing guards — execute never throws).
    if (!op.safe && !ctx?.writeEnabled) {
        return err('write_not_allowed', 'write mode is off (set FREEMIUS_MCP_ALLOW_WRITE=1 or pass --write)');
    }

    // 3. Destructive ops require a confirm echoing the resource id (fat-finger guard, §7).
    if (op.destructive) {
        const targetKey = destructiveTargetKey(op);
        const targetId = targetKey !== undefined ? params[targetKey] : undefined;
        const expected = targetId !== undefined ? targetId : operationId;
        if (String(ctx?.confirm) !== String(expected)) {
            return err('confirmation_required', `destructive op requires confirm="${expected}"`);
        }
    }

    // 4. Required-param presence check — for path/query catalog params only. The catalog has no
    //    per-field `required` for request-body props, so body validation is intentionally NOT done
    //    here (known limitation: a malformed body surfaces as the API's own 4xx via request_failed).
    for (const param of op.params) {
        if (!param.required || param.name === 'product_id') continue;
        if (params[param.name] === undefined || params[param.name] === null) {
            return err('invalid_params', `missing required param: ${param.name}`);
        }
    }

    // 5. Split the supplied params by the catalog into { path, query, body } and send via raw-client.
    const path: Record<string, string | number> = { product_id: client.api.productId };
    for (const name of pathPlaceholders(op.templatePath)) {
        const value = params[name];
        if (name !== 'product_id' && (typeof value === 'string' || typeof value === 'number')) {
            path[name] = value;
        }
    }

    const query: Record<string, unknown> = {};
    for (const param of op.params) {
        if (param.in === 'query' && params[param.name] !== undefined) {
            query[param.name] = params[param.name];
        }
    }

    let body: Record<string, unknown> | undefined;
    if (op.method !== 'GET') {
        body = {};
        for (const prop of op.requestBodyProps) {
            if (params[prop] !== undefined) {
                body[prop] = params[prop];
            }
        }
    }

    const result = await rawRequest(client, op.method, op.templatePath, { path, query, body });

    if (isOkStatus(result.status)) {
        return ok(result.data);
    }
    return err('request_failed', `${operationId} failed`, result.status);
}
