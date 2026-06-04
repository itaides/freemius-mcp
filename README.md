<h1 align="center">@eventimio/freemius-mcp</h1>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License">
  <img src="https://img.shields.io/badge/runtime-bun%201.3%2B-black?logo=bun" alt="Bun 1.3+">
  <img src="https://img.shields.io/badge/version-0.1.0-orange" alt="v0.1.0">
  <img src="https://img.shields.io/badge/operations-140-blue" alt="140 operations">
  <img src="https://img.shields.io/badge/default-read--only-green" alt="Read-only by default">
</p>

<h3 align="center">A CLI + MCP server for the Freemius product API — all 140 operations, read-only by default.</h3>

<p align="center"><em>Community / unofficial. Not affiliated with, endorsed by, or supported by Freemius.</em></p>

Operate a Freemius **product** — subscriptions, users, payments, plans, coupons, revenue — from the
terminal or straight from Claude. Built on the official [`@freemius/sdk`](https://www.npmjs.com/package/@freemius/sdk)
(MIT, exact-pinned), inheriting its auth and HMAC signing. There is no official Freemius MCP; this
fills that gap, the way Stripe and Polar ship agent tooling.

```console
$ freemius plans list
[ { "id": "45069", "name": "standard", "title": "Standard" }, … ]

$ freemius revenue-summary --days 90
{ "window": { "from": "…", "to": "…" },
  "byCurrency": { "usd": { "gross": 199.99, "refunds": 0, "net": 199.99, "count": 1 } } }

$ freemius call subscriptions/list            # generic escape hatch — any of the 140 operations
[]

$ freemius --write subscriptions cancel 123 --confirm 123   # writes are fail-closed
{ "id": 123, "is_canceled": true }
```

---

## Tools (MCP)

| Tool | What it does | Use when |
| --- | --- | --- |
| `list_subscriptions` / `get_subscription` | Browse / fetch a subscription | You want subscription data |
| `list_users` / `get_user` | Browse / fetch a user | Customer lookup |
| `list_payments` / `get_payment` | Browse / fetch a payment | Sales / transaction detail |
| `list_plans` / `get_plan` | Browse / fetch a pricing plan | Label a `plan_id`, see pricing tiers |
| `revenue_summary` | Bounded, **per-currency** gross / refunds / net over a date window | "How much did we make?" (not MRR) |
| `cancel_subscription` ⚠️ | Cancel a subscription — **destructive** | Needs write mode **and** a `confirm` echoing the id |
| `create_coupon` | Create a coupon | Needs write mode (not destructive) |
| `freemius_search_tools` | Find an operation by keyword over the 140-op catalog | You need an op the curated tools don't name |
| `freemius_describe_tool` | Show an operation's params | Before calling `freemius_execute_tool` |
| `freemius_execute_tool` | Run **any** of the 140 operations | The long tail — same fail-closed gate as everything else |

**Read-only by default.** Write tools (`cancel_subscription`, `create_coupon`, and any non-GET via
`freemius_execute_tool`) are refused unless `FREEMIUS_MCP_ALLOW_WRITE=1`; destructive ops also require
a `confirm`. Developer-scope ops (plan/pricing writes) are out of scope and return `scope_unsupported`.

## Interactive UIs (MCP Apps)

In hosts that support **[MCP Apps](https://github.com/modelcontextprotocol/ext-apps)** (like Claude Desktop), this server delivers rich, interactive sandboxed HTML/JS dashboards and forms instead of plain text responses. We currently have **three** interactive MCP Apps:

1. 📊 **Revenue Dashboard** (linked to `revenue_summary`): 
   - A per-currency aggregate breakdown showing Gross, Refunds, and Net revenue over a selected window.
   - Interactive buttons to toggle between `30d`, `90d`, and `365d` ranges.
2. 🎫 **Coupon Creation Form** (linked to `create_coupon`):
   - A guided, client-side validated form for creating coupons.
   - Dynamically loads your product's pricing plans to support plan-specific restrictions.
   - Gracefully handles write permission checks before submitting.
3. 👤 **Customer Profile Card** (linked to `get_user`):
   - A glassmorphic detail card showing key customer information.
   - Top metrics grid displaying lifetime value (LTV), active licenses count, and subscription count.
   - Tabbed view displaying:
     - **Subscriptions**: List of plans, pricing, status, and renewal dates.
     - **Payments**: Full transaction history with inline invoice actions.
     - **Licenses**: Activation count slot usage and partially redacted license keys.

*Note: Progressive enhancement is fully preserved — where MCP Apps are not supported by the host client (e.g. Claude Code CLI), tools gracefully fall back to returning their native structured JSON/text representation.*

## Authentication

Product-scope only — values from your Freemius dashboard (Developer → product → Settings → Keys).
Resolved with precedence **flags > env > profile**, so you can use env vars **or** an env-free profile
file (`~/.config/freemius/config.json`).

| Key | Required | Purpose |
|---|---|---|
| `FREEMIUS_PRODUCT_ID` | ✅ | Which product to operate on |
| `FREEMIUS_API_KEY` | ✅ | Bearer token — covers the large majority of reads and writes |
| `FREEMIUS_SECRET_KEY` / `FREEMIUS_PUBLIC_KEY` | optional | HMAC signed URLs (e.g. invoice download); secret must be ≥ 32 chars |
| `FREEMIUS_MCP_ALLOW_WRITE` | optional | `1` to allow mutating MCP tools (default: read-only) |

## Wire into Claude Code

**Recommended — env-free.** Put your keys once in `~/.config/freemius/config.json` (`chmod 600`), then
register with no env at all (`FREEMIUS_PROFILE` selects a non-default profile):

```jsonc
// ~/.config/freemius/config.json
{ "profiles": { "default": { "productId": "…", "apiKey": "…", "secretKey": "…", "publicKey": "…" } } }
```
```bash
claude mcp add freemius -- bun run /ABS/PATH/freemius-mcp/src/mcp/index.ts
```

**Alternative — `.env`** (env wins over the profile; secrets stay in the file, never in the Claude config):

```bash
claude mcp add freemius -- bun --env-file=/ABS/PATH/freemius-mcp/.env run /ABS/PATH/freemius-mcp/src/mcp/index.ts
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{ "mcpServers": { "freemius": { "command": "bun", "args": ["run", "/ABS/PATH/freemius-mcp/src/mcp/index.ts"] } } }
```

After an npm publish this becomes `{ "command": "npx", "args": ["-y", "@eventimio/freemius-mcp"] }`.
Sanity-check the server: `bun run scripts/live-mcp-check.ts`.

## Example prompts (in Claude)

- "How much revenue did the product make in the last 90 days?"
- "List the pricing plans, then show me plan 45069."
- "Look up payment 1956757 — who bought it and on which plan?"
- "Search Freemius operations for coupons, then list all coupons."
- "Does user 2311773 have an active subscription?"
- _(write mode on)_ "Cancel subscription 123" → I'll confirm the id before it runs.

## CLI

```bash
freemius subscriptions list|get <id>
freemius users         list|get <id>
freemius payments      list|get <id>
freemius plans         list|get <id>
freemius revenue-summary [--days 90] [--from <ts>] [--to <ts>]
freemius call <operationId> --param k=v --json '{…}'        # any of the 140 ops

# writes require --write; destructive ones also require --confirm <id>
freemius --write subscriptions cancel <id> --confirm <id>
freemius --write coupons create --code SAVE20 --discount 20 --discount-type percentage
```

Global flags: `--product <id>`, `--profile <name>`, `--write`, `--dry-run` (preview a mutation
without calling the API).

## Develop

```bash
bun install
cp .env.example .env          # or use a ~/.config/freemius/config.json profile
bun run dev:cli -- --help
bun run dev:mcp               # stdio MCP server
bun run test                  # vitest (msw-mocked) · typecheck · lint via biome
bun run build                 # → dist/{cli,mcp}/index.js
```

Operating the tool as an agent: [`AGENTS.md`](./AGENTS.md). Contributing: [`CONTRIBUTING.md`](./CONTRIBUTING.md). Architecture map: [`CLAUDE.md`](./CLAUDE.md).

## How it works

Two thin surfaces over one engine. `src/core` wraps the SDK: a `raw-client` isolation seam over the
SDK's `__unstable_ApiClient` (the only file that touches it), a generated 140-op **catalog**, a
unified `Result<T>`, and a single fail-closed `execute()` runner that enforces scope + write-gate +
confirm + param checks for every operation. The `commander` CLI and the `@modelcontextprotocol/sdk`
stdio server are lean shells that share those handlers, so behavior is identical across both.

## Documentation

- [`AGENTS.md`](./AGENTS.md) — operating the product as an agent (tools, safety, results)
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — how to build/contribute (setup, workflow, conventions)
- [`CLAUDE.md`](./CLAUDE.md) — architecture map & agent context
- [`docs/specs/`](./docs/specs) — the design spec (source of truth)
- [`CHANGELOG.md`](./CHANGELOG.md) · [`ROADMAP.md`](./ROADMAP.md) — shipped / next (keyless auth, MCP Apps)

## License

MIT — community / unofficial, not affiliated with Freemius.
