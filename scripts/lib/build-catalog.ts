// build-catalog.ts — pure transform: a parsed OpenAPI document → the operation catalog (docs/specs §9).
// Kept separate from generate.ts so it can be unit-tested against a fixture.

import type { CatalogEntry, HttpMethod, OpScope, ParamDef } from '../../src/core/catalog-types.js';

const METHODS = ['get', 'post', 'put', 'delete'] as const;

// Destructive non-DELETE writes (DELETE is destructive by default). Extend as the API adds them.
const DESTRUCTIVE_IDS = new Set<string>([]);

interface OpenApiDoc {
    paths: Record<string, Record<string, RawOperation | undefined>>;
    components?: { parameters?: Record<string, RawParam> };
}
interface RawOperation {
    operationId?: string;
    summary?: string;
    parameters?: RawParam[];
    requestBody?: { content?: Record<string, { schema?: { properties?: Record<string, unknown> } }> };
}
interface RawParam {
    $ref?: string;
    name?: string;
    in?: string;
    required?: boolean;
    schema?: { type?: string };
}

function scopeOf(path: string): OpScope {
    if (path.startsWith('/developers/')) return 'developer';
    if (path.startsWith('/products/{product_id}/')) return 'product';
    return 'other';
}

function resolveParamRef(ref: string, doc: OpenApiDoc): RawParam | undefined {
    // Only '#/components/parameters/<name>' is used by this spec.
    const name = ref.split('/').pop();
    return name ? doc.components?.parameters?.[name] : undefined;
}

function toParamDef(raw: RawParam, doc: OpenApiDoc): ParamDef | null {
    const param = raw.$ref ? resolveParamRef(raw.$ref, doc) : raw;
    if (!param || (param.in !== 'path' && param.in !== 'query') || !param.name) {
        return null;
    }
    return { name: param.name, in: param.in, required: Boolean(param.required), type: param.schema?.type };
}

function requestBodyProps(op: RawOperation): string[] {
    const schema = op.requestBody?.content?.['application/json']?.schema;
    return schema?.properties ? Object.keys(schema.properties) : [];
}

export function buildCatalog(doc: OpenApiDoc): CatalogEntry[] {
    const rows: CatalogEntry[] = [];

    for (const [templatePath, item] of Object.entries(doc.paths)) {
        for (const method of METHODS) {
            const op = item[method];
            if (!op?.operationId) continue;

            rows.push({
                id: op.operationId,
                method: method.toUpperCase() as HttpMethod,
                templatePath,
                scope: scopeOf(templatePath),
                summary: op.summary ?? '',
                safe: method === 'get',
                destructive: method === 'delete' || DESTRUCTIVE_IDS.has(op.operationId),
                params: (op.parameters ?? []).map((p) => toParamDef(p, doc)).filter((p): p is ParamDef => p !== null),
                requestBodyProps: requestBodyProps(op),
            });
        }
    }

    return rows.sort((a, b) => a.id.localeCompare(b.id));
}
