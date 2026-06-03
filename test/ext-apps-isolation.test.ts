// Isolation smoke test for the pinned @modelcontextprotocol/ext-apps (mirrors sdk-isolation.test.ts).
// Fails LOUDLY if a bump renames/removes the server helpers or the App client we depend on.

import { App } from '@modelcontextprotocol/ext-apps';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { describe, expect, it } from 'vitest';

describe('@modelcontextprotocol/ext-apps (isolation seam)', () => {
    it('exposes the server helpers we depend on', () => {
        expect(typeof registerAppTool).toBe('function');
        expect(typeof registerAppResource).toBe('function');
        expect(RESOURCE_MIME_TYPE).toBe('text/html;profile=mcp-app');
    });

    it('exposes the App client class', () => {
        expect(typeof App).toBe('function');
    });
});
