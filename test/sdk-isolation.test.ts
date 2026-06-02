// §10 isolation smoke test: the entire engine depends on @freemius/sdk's `api.__unstable_ApiClient`.
// This fails LOUDLY if a pinned-SDK bump renames or removes it, before it can ship broken.

import { describe, it, expect } from 'vitest';
import { Freemius } from '@freemius/sdk';

describe('@freemius/sdk __unstable_ApiClient (isolation seam)', () => {
    it('exposes a client with GET/POST/PUT/DELETE', () => {
        const fs = new Freemius({
            productId: '1',
            apiKey: 'test-api-key',
            secretKey: 'sk_'.padEnd(40, '0'),
            publicKey: 'pk_'.padEnd(40, '0'),
        });

        const client = fs.api.__unstable_ApiClient;

        for (const method of ['GET', 'POST', 'PUT', 'DELETE'] as const) {
            expect(typeof client[method]).toBe('function');
        }
    });
});
