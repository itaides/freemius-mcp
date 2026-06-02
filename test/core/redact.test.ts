import { describe, it, expect } from 'vitest';
import { redactSecrets } from '../../src/core/format.js';

describe('redactSecrets', () => {
    it('redacts secret-shaped keys in a flat object', () => {
        expect(redactSecrets({ apiKey: 'sk_live', secretKey: 'x'.repeat(40), name: 'ok' })).toEqual({
            apiKey: '[redacted]',
            secretKey: '[redacted]',
            name: 'ok',
        });
    });

    it('redacts nested objects and arrays', () => {
        const input = { items: [{ authorization: 'FS 1:2:3', label: 'keep' }] };
        expect(redactSecrets(input)).toEqual({ items: [{ authorization: '[redacted]', label: 'keep' }] });
    });

    it('redacts auth params inside URL-shaped strings', () => {
        const url = 'https://fast-api.freemius.com/v1/x.pdf?authorization=FS%201:2:3&auth_date=2026-06-03';
        expect(redactSecrets(url)).toBe(
            'https://fast-api.freemius.com/v1/x.pdf?authorization=[redacted]&auth_date=[redacted]'
        );
    });

    it('leaves non-secret values untouched', () => {
        expect(redactSecrets({ id: 7, plan: 'pro' })).toEqual({ id: 7, plan: 'pro' });
    });
});
