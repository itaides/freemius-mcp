# @eventimio/freemius-mcp

> **Community / unofficial.** Not affiliated with, endorsed by, or supported by Freemius.

A **CLI** (`freemius`) and an **MCP server** (`freemius-mcp`) that give AI agents, humans, and CI
ergonomic control of a Freemius **product** — built on the official [`@freemius/sdk`](https://www.npmjs.com/package/@freemius/sdk)
(MIT) as a pinned dependency, inheriting its auth, HMAC signing, typing, and pagination.

**Read-only by default.** Mutations require an explicit write opt-in. Developer-scope operations
(plan/pricing writes, etc.) are out of scope in v1. See [`docs/specs`](./docs/specs) for the full design.

## Status

🚧 Early scaffold. The engine is being implemented against the design spec.

## Quick start (development)

```bash
bun install
cp .env.example .env   # fill in FREEMIUS_PRODUCT_ID + FREEMIUS_API_KEY
bun run dev:cli -- --help
bun run dev:mcp        # stdio MCP server
```

## MCP client config (after publish)

```json
{
  "command": "npx",
  "args": ["-y", "@eventimio/freemius-mcp"]
}
```

Pre-publish, point your MCP client at `node /absolute/path/to/dist/mcp/index.js` (run `bun run build` first).

## Layout

| Path | What |
|------|------|
| `src/core/` | Shared engine — both bins use it (auth, raw client, execute, guards, codegen artifacts) |
| `src/cli/` | `commander` → `freemius` bin |
| `src/mcp/` | `@modelcontextprotocol/sdk` stdio server → `freemius-mcp` bin |
| `scripts/` | `generate.ts` (codegen), `fetch-spec.ts`, `build.ts` |
| `docs/` | Design spec + implementation plan |

## License

MIT
