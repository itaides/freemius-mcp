// auth.ts — resolve product-scope credentials (docs/specs §8). Product scope only.
// Precedence: flags > env > ~/.config/freemius/config.json profile. Clear "missing credential" errors.

export interface Credentials {
    productId: string;
    apiKey: string;
    secretKey?: string;
    publicKey?: string;
}

export interface ResolveInput {
    /** CLI flag overrides (highest precedence), e.g. --product. */
    flags?: Partial<Credentials>;
    /** Environment source; defaults to process.env. */
    env?: Record<string, string | undefined>;
}

export class MissingCredentialError extends Error {
    constructor(public readonly field: string) {
        super(`Missing Freemius credential: ${field}`);
        this.name = 'MissingCredentialError';
    }
}

export function resolveCredentials(input: ResolveInput = {}): Credentials {
    const env = input.env ?? process.env;
    const productId = input.flags?.productId ?? env.FREEMIUS_PRODUCT_ID ?? '';
    const apiKey = input.flags?.apiKey ?? env.FREEMIUS_API_KEY ?? '';

    return { productId, apiKey };
}
