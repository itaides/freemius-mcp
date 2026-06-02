import { describe, it, expect } from 'vitest';
import { withTimeout, TimeoutError } from '../../src/core/timeout.js';

describe('withTimeout', () => {
    it('resolves with the value when the promise settles in time', async () => {
        await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
    });

    it('rejects with TimeoutError when the budget is exceeded', async () => {
        const never = new Promise<number>(() => {});
        await expect(withTimeout(never, 10)).rejects.toBeInstanceOf(TimeoutError);
    });

    it('propagates the underlying rejection unchanged', async () => {
        const boom = Promise.reject(new Error('boom'));
        await expect(withTimeout(boom, 1000)).rejects.toThrow('boom');
    });
});
