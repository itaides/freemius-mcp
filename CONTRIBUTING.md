# Contributing to `@eventimio/freemius-mcp`

Thanks for helping out. This is a community/unofficial CLI + MCP server over the official
`@freemius/sdk`. This guide is for **building the project**; for *using* it as an agent see
[`AGENTS.md`](./AGENTS.md), and for the deep architecture map see [`CLAUDE.md`](./CLAUDE.md). The
design spec in [`docs/specs/`](./docs/specs) is the source of truth.

## Prerequisites & setup

- **[Bun](https://bun.sh) 1.3+** (package manager + runtime + bundler). No npm.
- Node 18+ if you want to run the built bins under node.

```bash
git clone git@github.com:itaides/freemius-mcp.git
cd freemius-mcp
bun install
cp .env.example .env        # FREEMIUS_PRODUCT_ID + FREEMIUS_API_KEY (+ optional secret/public)
```

Tests are fully mocked, so you don't need real credentials to develop — only to run the live-check
scripts.

## Development workflow

```bash
bun run dev:cli -- --help                       # run the CLI from source
bun run dev:mcp                                  # run the MCP server (stdio)
bun run test                                     # full Vitest run
bun run vitest run test/core/auth.test.ts        # a single test file
bun run vitest run -t "throws when write mode is off"   # a single test by name
bun run typecheck                                # tsc --noEmit
bun run lint            /  bun run lint:fix       # biome check  /  --write
bun run build                                    # Bun bundler → dist/{cli,mcp}/index.js
bun run generate                                 # regenerate catalog.ts + schema.d.ts from openapi.yaml
```

**Before opening a PR, the gate must be green:** `bun run typecheck && bun run lint && bun run test`.

## Ground rules

- **TDD, always.** Write the failing test (Vitest + **msw**) first, watch it fail, then implement.
  **Never hit the live API in a test** — mock at the fetch layer (`https://fast-api.freemius.com/...`).
- **Code style is Biome** (`biome.json`): 4-space, single quotes, semicolons, 120 cols. Run
  `bun run lint:fix`. TypeScript strict; `import type` for type-only imports; prefer `unknown` over `any`.
- **Every handler returns `Result<T>`** (`src/core/result.ts`) — `{ ok, data } | { ok: false, error }`.

## Architecture invariants (don't break these)

- **`@freemius/sdk` is pinned EXACT** (`0.3.0`). A bump is its own PR: re-run the `__unstable_ApiClient`
  smoke test (`test/sdk-isolation.test.ts`) and regenerate the catalog.
- **`src/core/raw-client.ts` is the ONLY file that touches `api.__unstable_ApiClient`** (via
  `unstableClient()`). Pass the **template** path + `{ path, query }` separately — never pre-interpolate.
- **All reads go through the raw client** (`getEntity`/`listEntity`), not the SDK's typed services
  (they swallow non-2xx to `[]`/`null`).
- **Fail-closed writes.** Never register a mutation that bypasses `assertWriteEnabled`; destructive ops
  also require `assertConfirmed`. The generic `execute()` enforces the same gate for all 140 ops.
- **Don't edit generated files** (`src/core/catalog.ts`, `src/core/schema.d.ts`) — change
  `scripts/generate.ts` / `scripts/lib/build-catalog.ts` and run `bun run generate`.

## Common contributions (recipes)

The `freemius-mcp-engineer` skill has the full recipes; in short:

- **Add a curated read entity** — one line in `READ_ENTITIES` (`src/core/entities.ts`) + a case in the
  parametrized `test/cli/reads.test.ts`. The CLI and MCP both pick it up automatically.
- **Add a write** — a handler returning `Result<T>` (raw client for entities with no SDK service),
  gated with `assertWriteEnabled` (+ `assertConfirmed` if destructive), wired into the CLI command and
  an MCP tool with the right annotations. Copy `cancel_subscription` / `create_coupon`.
- **Add an MCP tool** — `server.registerTool(name, { description, inputSchema, annotations }, handler)`;
  `inputSchema` is a raw zod shape (`{ id: z.string() }`). Reuse the existing handler.

## Gotchas (verified against sdk 0.3.0)

- `new Freemius()` throws if `secretKey` < 32 chars even for reads → a placeholder is injected and
  signed-URL ops are gated on `canSign`.
- The SDK `user` service sends a `fields=` param that 500s on the live API → users read via the raw
  client (no `fields`), guarded by a test.
- SDK services swallow errors — test against mocks **and** verify live before claiming a read works.

## Commit & PR guidelines

- Branch off `main`. Keep changes minimal and focused; don't refactor unrelated code.
- Conventional-ish subjects: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`.
- End AI-authored commits with a `Co-Authored-By:` trailer.
- A PR should: state what changed and why, keep the gate green, and update docs
  ([`CHANGELOG.md`](./CHANGELOG.md) under `[Unreleased]`, plus README/spec if behavior changed).
- Security-sensitive areas (the write gate, the `__unstable_` seam, credential handling) get extra
  scrutiny — call them out in the PR description.

By contributing you agree your contributions are licensed under the project's MIT license.
