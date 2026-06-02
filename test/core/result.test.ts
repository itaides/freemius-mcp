import { describe, expect, it } from 'vitest';
import { err, ok, type Result } from '../../src/core/result.js';

describe('Result', () => {
    it('ok wraps data with ok:true', () => {
        expect(ok({ id: 7 })).toEqual({ ok: true, data: { id: 7 } });
    });

    it('err builds an error envelope with ok:false', () => {
        expect(err('not_found', 'plan 7 not found', 404)).toEqual({
            ok: false,
            error: { code: 'not_found', message: 'plan 7 not found', status: 404 },
        });
    });

    it('err allows an absent status', () => {
        const result: Result<number> = err('request_failed', 'boom');
        expect(result).toEqual({ ok: false, error: { code: 'request_failed', message: 'boom' } });
    });
});
