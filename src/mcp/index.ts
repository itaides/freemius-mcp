// freemius-mcp — stdio MCP server (docs/specs §7). Read-only by default; writes require
// FREEMIUS_MCP_ALLOW_WRITE=1. Registers curated named tools + the dynamic trio.
// (The `#!/usr/bin/env node` shebang is added at build time by scripts/build.ts.)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerCuratedTools } from './tools/curated.js';
import { registerDynamicTools } from './tools/dynamic.js';

async function main(): Promise<void> {
    const writeEnabled = process.env.FREEMIUS_MCP_ALLOW_WRITE === '1';

    const server = new McpServer({ name: 'freemius-mcp', version: '0.0.0' });

    registerCuratedTools(server, { writeEnabled });
    registerDynamicTools(server, { writeEnabled });

    await server.connect(new StdioServerTransport());
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
