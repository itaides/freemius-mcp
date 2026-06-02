import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../../scripts/lib/build-catalog.js';

const DOC = {
    components: {
        parameters: {
            count: { name: 'count', in: 'query', required: false, schema: { type: 'integer' } },
        },
    },
    paths: {
        '/products/{product_id}/coupons.json': {
            get: {
                operationId: 'coupons/list',
                summary: 'List all coupons',
                parameters: [
                    { name: 'code', in: 'query', required: false, schema: { type: 'string' } },
                    { $ref: '#/components/parameters/count' },
                ],
            },
            post: {
                operationId: 'coupons/create',
                summary: 'Create a coupon',
                requestBody: {
                    content: {
                        'application/json': { schema: { type: 'object', properties: { code: {}, discount: {} } } },
                    },
                },
            },
        },
        '/products/{product_id}/coupons/{coupon_id}.json': {
            delete: {
                operationId: 'coupons/delete',
                summary: 'Delete a coupon',
                parameters: [{ name: 'coupon_id', in: 'path', required: true, schema: { type: 'integer' } }],
            },
        },
        '/developers/{developer_id}/products/{product_id}/plans.json': {
            post: { operationId: 'plans/create', summary: 'Create a plan' },
        },
    },
};

describe('buildCatalog', () => {
    const rows = buildCatalog(DOC);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    const op = (id: string) => {
        const row = byId[id];
        if (!row) throw new Error(`no catalog row for ${id}`);
        return row;
    };

    it('emits one row per operation', () => {
        expect(rows.map((r) => r.id).sort()).toEqual([
            'coupons/create',
            'coupons/delete',
            'coupons/list',
            'plans/create',
        ]);
    });

    it('marks only GET as safe, DELETE as destructive', () => {
        expect(op('coupons/list')).toMatchObject({ method: 'GET', safe: true, destructive: false });
        expect(op('coupons/create')).toMatchObject({ method: 'POST', safe: false, destructive: false });
        expect(op('coupons/delete')).toMatchObject({ method: 'DELETE', safe: false, destructive: true });
    });

    it('classifies scope from the path', () => {
        expect(op('coupons/list').scope).toBe('product');
        expect(op('plans/create').scope).toBe('developer');
    });

    it('resolves $ref params and keeps path/query params', () => {
        expect(op('coupons/list').params).toEqual([
            { name: 'code', in: 'query', required: false, type: 'string' },
            { name: 'count', in: 'query', required: false, type: 'integer' },
        ]);
    });

    it('collects requestBody property names', () => {
        expect(op('coupons/create').requestBodyProps).toEqual(['code', 'discount']);
        expect(op('coupons/list').requestBodyProps).toEqual([]);
    });
});
