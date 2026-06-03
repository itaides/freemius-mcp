// freemius-mcp — stdio MCP server (docs/specs §7). Read-only by default; writes require
// FREEMIUS_MCP_ALLOW_WRITE=1. Registers curated named tools plus the catalog-driven dynamic trio.
// (The `#!/usr/bin/env node` shebang is added at build time by scripts/build.ts.)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadProfile } from '../core/auth.js';
import { createFreemius } from '../core/freemius.js';
import { VERSION } from '../core/version.js';
import { registerCuratedTools } from './tools/curated.js';
import { registerDynamicTools } from './tools/dynamic.js';

async function main(): Promise<void> {
    // Resolve creds with the same precedence as the CLI: env > ~/.config/freemius/config.json profile.
    // So the server can run env-free (`bun run src/mcp/index.ts`) reading the profile, not just --env-file.
    const { client } = createFreemius({ profile: loadProfile(process.env.FREEMIUS_PROFILE ?? 'default') });
    const writeEnabled = process.env.FREEMIUS_MCP_ALLOW_WRITE === '1';

    const server = new McpServer({ name: 'freemius-mcp', version: VERSION });
    registerCuratedTools(server, client, { writeEnabled });
    registerDynamicTools(server, client, { writeEnabled });

    await server.connect(new StdioServerTransport());
    console.error(`freemius-mcp running on stdio (${writeEnabled ? 'WRITE ENABLED' : 'read-only'})`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
