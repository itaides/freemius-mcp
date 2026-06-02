import { describe, it, expect } from 'vitest';
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
                    content: { 'application/json': { schema: { type: 'object', properties: { code: {}, discount: {} } } } },
                },
            },
        },
        '/products/{product_id}/coupons/{coupon_id}.json': {
            delete: { operationId: 'coupons/delete', summary: 'Delete a coupon', parameters: [{ name: 'coupon_id', in: 'path', required: true, schema: { type: 'integer' } }] },
        },
        '/developers/{developer_id}/products/{product_id}/plans.json': {
            post: { operationId: 'plans/create', summary: 'Create a plan' },
        },
    },
};

describe('buildCatalog', () => {
    const rows = buildCatalog(DOC);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

    it('emits one row per operation', () => {
        expect(rows.map((r) => r.id).sort()).toEqual(['coupons/create', 'coupons/delete', 'coupons/list', 'plans/create']);
    });

    it('marks only GET as safe, DELETE as destructive', () => {
        expect(byId['coupons/list']).toMatchObject({ method: 'GET', safe: true, destructive: false });
        expect(byId['coupons/create']).toMatchObject({ method: 'POST', safe: false, destructive: false });
        expect(byId['coupons/delete']).toMatchObject({ method: 'DELETE', safe: false, destructive: true });
    });

    it('classifies scope from the path', () => {
        expect(byId['coupons/list']!.scope).toBe('product');
        expect(byId['plans/create']!.scope).toBe('developer');
    });

    it('resolves $ref params and keeps path/query params', () => {
        expect(byId['coupons/list']!.params).toEqual([
            { name: 'code', in: 'query', required: false, type: 'string' },
            { name: 'count', in: 'query', required: false, type: 'integer' },
        ]);
    });

    it('collects requestBody property names', () => {
        expect(byId['coupons/create']!.requestBodyProps).toEqual(['code', 'discount']);
        expect(byId['coupons/list']!.requestBodyProps).toEqual([]);
    });
});
