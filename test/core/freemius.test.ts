import { describe, it, expect } from 'vitest';
import { Freemius } from '@freemius/sdk';
import { createFreemius } from '../../src/core/freemius.js';

describe('createFreemius', () => {
    it('builds a client from api key alone — no secret needed for reads', () => {
        const { client, canSign } = createFreemius({
            env: { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_abc' },
        });

        expect(client).toBeInstanceOf(Freemius);
        expect(canSign).toBe(false);
    });

    it('reports canSign=true when a valid secret and public key are provided', () => {
        const { canSign } = createFreemius({
            env: {
                FREEMIUS_PRODUCT_ID: '1',
                FREEMIUS_API_KEY: 'sk_abc',
                FREEMIUS_SECRET_KEY: 's'.repeat(40),
                FREEMIUS_PUBLIC_KEY: 'p'.repeat(40),
            },
        });

        expect(canSign).toBe(true);
    });
});
