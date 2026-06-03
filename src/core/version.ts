// version.ts — single source of truth for the package version, used by the CLI `--version` and the
// MCP `initialize` handshake (`new McpServer({ name, version })`, per @modelcontextprotocol/typescript-sdk).
import pkg from '../../package.json' with { type: 'json' };

export const VERSION: string = pkg.version;
