// freemius.ts — construct the SDK Freemius client from resolved credentials (docs/specs §5).
// Base URL is always routed through the SDK client; we never hand-build base URLs.

import { resolveCredentials, type Credentials, type ResolveInput } from './auth.js';

// import { Freemius } from '@freemius/sdk';

// TODO(docs/specs §5): return `new Freemius({ productId, apiKey, secretKey, publicKey })`.
// (Profile-name → profile-data loading happens before this, then is passed in via input.profile.)
export function createFreemius(input: ResolveInput = {}): { creds: Credentials } {
    const creds = resolveCredentials(input);
    return { creds };
}
