import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadProfile } from '../../src/core/auth.js';

describe('loadProfile', () => {
    let dir: string;
    let configPath: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'freemius-mcp-'));
        configPath = join(dir, 'config.json');
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('loads a named profile from the config file', () => {
        writeFileSync(
            configPath,
            JSON.stringify({ profiles: { staging: { productId: 'p1', apiKey: 'k1', secretKey: 's1' } } })
        );

        const profile = loadProfile('staging', { configPath });

        expect(profile).toEqual({ productId: 'p1', apiKey: 'k1', secretKey: 's1' });
    });

    it('returns an empty object when the config file does not exist', () => {
        const profile = loadProfile('staging', { configPath: join(dir, 'missing.json') });

        expect(profile).toEqual({});
    });

    it('returns an empty object when the named profile is absent', () => {
        writeFileSync(configPath, JSON.stringify({ profiles: { default: { productId: 'p1', apiKey: 'k1' } } }));

        const profile = loadProfile('staging', { configPath });

        expect(profile).toEqual({});
    });
});
