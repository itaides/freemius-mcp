import { describe, it, expect } from 'vitest';
import { toGetResult } from '../../src/core/reads.js';

describe('toGetResult', () => {
    it('wraps a present entity as found', () => {
        expect(toGetResult({ id: 7 }, '7')).toEqual({ found: true, data: { id: 7 } });
    });

    it('reports not-found with the id when the entity is null', () => {
        expect(toGetResult(null, '7')).toEqual({ found: false, id: '7' });
    });
});
