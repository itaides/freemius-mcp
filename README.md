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

## MCP server

Exposes read-only tools: `list_subscriptions`, `get_subscription`, `list_users`, `get_user`,
`list_payments`, `get_payment`, `list_plans`, `get_plan` (more, and writes, to come).

**Wire into Claude Code (pre-publish, from source — no secrets in the config, reads your `.env`):**

```bash
claude mcp add freemius -- bun --env-file=/ABS/PATH/freemius-mcp/.env run /ABS/PATH/freemius-mcp/src/mcp/index.ts
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "freemius": {
      "command": "bun",
      "args": ["--env-file=/ABS/PATH/freemius-mcp/.env", "run", "/ABS/PATH/freemius-mcp/src/mcp/index.ts"]
    }
  }
}
```

**After publish:** `{ "command": "npx", "args": ["-y", "@eventimio/freemius-mcp"] }` with the four
`FREEMIUS_*` values supplied via the host's `env` block.

Sanity-check the server end-to-end: `bun run scripts/live-mcp-check.ts`.

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
