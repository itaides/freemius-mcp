# @eventimio/freemius-mcp

> **Community / unofficial.** Not affiliated with, endorsed by, or supported by Freemius.

A **CLI** (`freemius`) and an **MCP server** (`freemius-mcp`) that give AI agents, humans, and CI
ergonomic control of a Freemius **product** — built on the official [`@freemius/sdk`](https://www.npmjs.com/package/@freemius/sdk)
(MIT) as a pinned dependency, inheriting its auth, HMAC signing, typing, and pagination.

**Read-only by default.** Mutations require an explicit write opt-in. Developer-scope operations
(plan/pricing writes, etc.) are out of scope in v1. See [`docs/specs`](./docs/specs) for the full design.

## Status

✅ **v1 — working, full coverage.** The CLI and MCP server are live and verified against a real
product: curated reads (subscriptions, users, payments, plans) + guarded writes
(`cancel_subscription`, `create_coupon`), **plus a generic long-tail** — `freemius call <op>` and the
dynamic MCP trio (`search`/`describe`/`execute`) — that reaches **all 140 operations** through one
fail-closed `execute` runner. Built on a unified `Result<T>` engine with request timeouts, secret
redaction, and a generated operation catalog. Read-only by default. See
[`CHANGELOG.md`](./CHANGELOG.md) and the [implementation plan](./docs/plans).

## Authentication

Product-scope only — four values from your Freemius dashboard (Developer → product → Settings → Keys):

| Env var | Required | Purpose |
|---|---|---|
| `FREEMIUS_PRODUCT_ID` | ✅ | Which product to operate on |
| `FREEMIUS_API_KEY` | ✅ | Bearer token — covers the large majority of reads and writes |
| `FREEMIUS_SECRET_KEY` | optional | HMAC signed URLs (e.g. invoice download); must be ≥ 32 chars |
| `FREEMIUS_PUBLIC_KEY` | optional | Pairs with the secret for signing |
| `FREEMIUS_MCP_ALLOW_WRITE` | optional | `1` to allow mutating MCP tools (default: read-only) |

## Quick start (development)

```bash
bun install
cp .env.example .env   # fill in FREEMIUS_PRODUCT_ID + FREEMIUS_API_KEY
bun run dev:cli -- --help
bun run dev:mcp        # stdio MCP server
```

## CLI

```bash
freemius subscriptions list|get <id>
freemius users         list|get <id>
freemius payments      list|get <id>
freemius plans         list|get <id>

# writes require --write; destructive ones also require --confirm <id>
freemius --write subscriptions cancel <id> --confirm <id>
freemius --write coupons create --code SAVE20 --discount 20 --discount-type percentage
```

Global flags: `--product <id>`, `--profile <name>` (reads `~/.config/freemius/config.json` — no env
needed), `--write`, `--dry-run` (preview a mutation without calling the API).

## MCP server

Read tools (always on): `list_subscriptions`, `get_subscription`, `list_users`, `get_user`,
`list_payments`, `get_payment`, `list_plans`, `get_plan`.

Write tools (gated, off by default): set `FREEMIUS_MCP_ALLOW_WRITE=1` to enable —
- `cancel_subscription` — **destructive**; also requires a `confirm` arg echoing the subscription id.
- `create_coupon` — needs write mode (not destructive, no confirm).

Dynamic trio (full 140-op coverage at ~3 tools): `freemius_search_tools` (find an operation),
`freemius_describe_tool` (its params), `freemius_execute_tool` (run it — same fail-closed write/confirm
gate as everything else).

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
| `src/core/` | Shared engine — both bins use it (auth, raw client, reads, guards, codegen artifacts) |
| `src/cli/` | `commander` → `freemius` bin |
| `src/mcp/` | `@modelcontextprotocol/sdk` stdio server → `freemius-mcp` bin |
| `scripts/` | `generate.ts` (codegen), `fetch-spec.ts`, `build.ts`, live-check scripts |
| `docs/` | Design spec + implementation plan |

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — master index & context map (start here)
- [`docs/specs/`](./docs/specs) — the design spec (source of truth)
- [`CHANGELOG.md`](./CHANGELOG.md) — what's shipped
- [`ROADMAP.md`](./ROADMAP.md) — what's next (keyless auth, MCP Apps, revenue_summary)

## License

MIT — community / unofficial, not affiliated with Freemius.
