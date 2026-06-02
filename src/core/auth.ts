// auth.ts — resolve product-scope credentials (docs/specs §8). Product scope only.
// Precedence: flags > env > ~/.config/freemius/config.json profile. Clear "missing credential" errors.

export interface Credentials {
    productId: string;
    apiKey: string;
    secretKey?: string;
    publicKey?: string;
}

// TODO(docs/specs §8): read env / profile, validate presence, redact in any error output.
export function resolveCredentials(_opts?: { profile?: string; productId?: string }): Credentials {
    throw new Error('auth.resolveCredentials: not implemented — see docs/specs §8');
}
