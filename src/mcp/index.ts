// freemius-mcp — stdio MCP server (docs/specs §7). Read-only by default; writes require
// FREEMIUS_MCP_ALLOW_WRITE=1. Registers curated named tools (dynamic trio lands with codegen).
// (The `#!/usr/bin/env node` shebang is added at build time by scripts/build.ts.)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createFreemius } from '../core/freemius.js';
import { registerCuratedTools } from './tools/curated.js';

async function main(): Promise<void> {
    const { client } = createFreemius();

    const server = new McpServer({ name: 'freemius-mcp', version: '0.0.0' });
    registerCuratedTools(server, client);

    await server.connect(new StdioServerTransport());
    console.error('freemius-mcp running on stdio (read-only)');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
