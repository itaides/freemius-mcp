// live-mcp-check.ts — spawn the real MCP server over stdio and exercise it against the live API.
//   Run:  bun run scripts/live-mcp-check.ts
// Lists the tools, then calls list_plans. Never prints secrets.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
    command: 'bun',
    args: ['run', 'src/mcp/index.ts'],
    env: process.env as Record<string, string>,
});

const client = new Client({ name: 'live-check', version: '0.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log('✅ MCP server up. Tools:', tools.map((t) => t.name).join(', '));

const result = await client.callTool({ name: 'list_plans', arguments: {} });
const content = result.content as Array<{ type: string; text: string }>;
const plans = JSON.parse(content[0]?.text ?? '[]') as Array<{ id: unknown; name?: unknown }>;
console.log(
    '✅ list_plans →',
    plans.map((p) => ({ id: p.id, name: p.name }))
);

await client.close();
