import { describe, it, expect } from 'vitest';
import { resolveCredentials, MissingCredentialError } from '../../src/core/auth.js';

describe('resolveCredentials', () => {
    it('reads product id and api key from env', () => {
        const creds = resolveCredentials({
            env: { FREEMIUS_PRODUCT_ID: '123', FREEMIUS_API_KEY: 'sk_abc' },
        });

        expect(creds.productId).toBe('123');
        expect(creds.apiKey).toBe('sk_abc');
    });
});
