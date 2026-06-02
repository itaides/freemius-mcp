// auth.ts — resolve product-scope credentials (docs/specs §8). Product scope only.
// Precedence: flags > env > ~/.config/freemius/config.json profile. Clear "missing credential" errors.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

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
    /** Named-profile values (lowest precedence), already loaded from config (see loadProfile). */
    profile?: Partial<Credentials>;
}

export class MissingCredentialError extends Error {
    constructor(public readonly field: string) {
        super(`Missing Freemius credential: ${field}`);
        this.name = 'MissingCredentialError';
    }
}

export interface LoadProfileOptions {
    /** Path to the config JSON; defaults to ~/.config/freemius/config.json. */
    configPath?: string;
}

/**
 * Load a named profile's credential values from the config file (docs/specs §8).
 * Returns {} if the file or the named profile does not exist — profiles are optional.
 * Config shape: { "profiles": { "<name>": { productId, apiKey, secretKey?, publicKey? } } }
 */
export function loadProfile(name: string, options: LoadProfileOptions = {}): Partial<Credentials> {
    const configPath = options.configPath ?? join(homedir(), '.config', 'freemius', 'config.json');

    if (!existsSync(configPath)) {
        return {};
    }

    const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as {
        profiles?: Record<string, Partial<Credentials>>;
    };

    return parsed.profiles?.[name] ?? {};
}

export function resolveCredentials(input: ResolveInput = {}): Credentials {
    const env = input.env ?? process.env;
    const profile = input.profile ?? {};

    // Precedence per field: flags > env > profile.
    const productId = input.flags?.productId ?? env.FREEMIUS_PRODUCT_ID ?? profile.productId;
    const apiKey = input.flags?.apiKey ?? env.FREEMIUS_API_KEY ?? profile.apiKey;

    if (!productId) {
        throw new MissingCredentialError('productId');
    }
    if (!apiKey) {
        throw new MissingCredentialError('apiKey');
    }

    const secretKey = input.flags?.secretKey ?? env.FREEMIUS_SECRET_KEY ?? profile.secretKey;
    const publicKey = input.flags?.publicKey ?? env.FREEMIUS_PUBLIC_KEY ?? profile.publicKey;

    return { productId, apiKey, secretKey, publicKey };
}
