// freemius.ts — construct the SDK Freemius client from resolved credentials (docs/specs §5).
// Base URL is always routed through the SDK client; we never hand-build base URLs.

import { resolveCredentials, type Credentials } from './auth.js';

// import { Freemius } from '@freemius/sdk';

// TODO(docs/specs §5): return `new Freemius({ productId, apiKey, secretKey, publicKey })`.
export function createFreemius(opts?: { profile?: string; productId?: string }): { creds: Credentials } {
    const creds = resolveCredentials(opts);
    return { creds };
}
