// freemius.ts — construct the SDK Freemius client from resolved credentials (docs/specs §5, §8).
// Base URL is always routed through the SDK client; we never hand-build base URLs.

import { Freemius } from '@freemius/sdk';
import { resolveCredentials, type ResolveInput } from './auth.js';

// The SDK's AuthService constructor throws if secretKey is missing or < 32 chars, even though
// Bearer reads/writes never use the secret (it's only for signed URLs). So when no real secret is
// provided we inject this placeholder to let the client construct, and gate signing via `canSign`.
const PLACEHOLDER_SECRET = 'fm-no-secret-provided-0000000000000000';

export interface FreemiusContext {
    client: Freemius;
    /** True only when a real secret + public key are present; signed-URL ops require this. */
    canSign: boolean;
}

export function createFreemius(input: ResolveInput = {}): FreemiusContext {
    const creds = resolveCredentials(input);
    const canSign = Boolean(creds.secretKey && creds.publicKey);

    const client = new Freemius({
        productId: creds.productId,
        apiKey: creds.apiKey,
        secretKey: creds.secretKey ?? PLACEHOLDER_SECRET,
        publicKey: creds.publicKey ?? PLACEHOLDER_SECRET,
    });

    return { client, canSign };
}
