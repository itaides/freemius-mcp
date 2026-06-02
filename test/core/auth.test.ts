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

    it('throws MissingCredentialError when product id is absent', () => {
        expect(() => resolveCredentials({ env: { FREEMIUS_API_KEY: 'sk_abc' } })).toThrow(MissingCredentialError);
    });

    it('throws MissingCredentialError when api key is absent', () => {
        expect(() => resolveCredentials({ env: { FREEMIUS_PRODUCT_ID: '123' } })).toThrow(MissingCredentialError);
    });

    it('picks up optional secret and public keys from env', () => {
        const creds = resolveCredentials({
            env: {
                FREEMIUS_PRODUCT_ID: '123',
                FREEMIUS_API_KEY: 'sk_abc',
                FREEMIUS_SECRET_KEY: 'secret-value',
                FREEMIUS_PUBLIC_KEY: 'public-value',
            },
        });

        expect(creds.secretKey).toBe('secret-value');
        expect(creds.publicKey).toBe('public-value');
    });

    it('leaves optional keys undefined when not provided', () => {
        const creds = resolveCredentials({
            env: { FREEMIUS_PRODUCT_ID: '123', FREEMIUS_API_KEY: 'sk_abc' },
        });

        expect(creds.secretKey).toBeUndefined();
        expect(creds.publicKey).toBeUndefined();
    });

    it('falls back to profile values when env and flags are absent', () => {
        const creds = resolveCredentials({
            env: {},
            profile: { productId: '999', apiKey: 'pk_profile' },
        });

        expect(creds.productId).toBe('999');
        expect(creds.apiKey).toBe('pk_profile');
    });

    it('prefers env over profile', () => {
        const creds = resolveCredentials({
            env: { FREEMIUS_PRODUCT_ID: '123', FREEMIUS_API_KEY: 'sk_env' },
            profile: { productId: '999', apiKey: 'pk_profile' },
        });

        expect(creds.productId).toBe('123');
        expect(creds.apiKey).toBe('sk_env');
    });

    it('prefers flags over env and profile', () => {
        const creds = resolveCredentials({
            flags: { productId: 'flag-product' },
            env: { FREEMIUS_PRODUCT_ID: '123', FREEMIUS_API_KEY: 'sk_env' },
            profile: { productId: '999', apiKey: 'pk_profile' },
        });

        expect(creds.productId).toBe('flag-product');
    });
});
