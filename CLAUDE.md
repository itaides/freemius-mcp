# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Master Index & Context Map**
> Entry point for understanding the **`@eventimio/freemius-mcp`** codebase. This file plus one
> linked document should be enough context for most tasks.

## 1. Project Overview

A **CLI** (`freemius`) and an **MCP server** (`freemius-mcp`) that give AI agents, humans, and CI
ergonomic control of a Freemius **product** — like Stripe/Polar ship official MCP tooling.

- **Two surfaces, one engine.** The CLI and MCP server are thin shells over shared handlers in `src/`.
- **Built on the official `@freemius/sdk`** (MIT), consumed as an **exact-pinned** npm dependency
  (`0.3.0`) — _not_ a fork, _not_ `workspace:*`. We inherit its auth, HMAC signing, and pagination.
- **Read-only by default.** Writes require an explicit opt-in; destructive writes also require a
  `confirm` echo (fail-closed).
- **Product scope only.** Developer-scope ops (plan/pricing writes, etc.) need a login/2FA flow the
  SDK doesn't implement → out of scope for v1.
- **Stack:** Bun (pkg manager + runtime + bundler), TypeScript, commander (CLI),
  `@modelcontextprotocol/sdk` (MCP), zod v4, Vitest + msw (tests).

## 2. Context Map (Where to look?)

| Topic | Document | Description |
| :--- | :--- | :--- |
| **Design spec** | [`docs/specs/2026-06-02-freemius-mcp-cli-design.md`](docs/specs/2026-06-02-freemius-mcp-cli-design.md) | The source of truth. Scope, auth, safety model, codegen, revenue_summary, §-numbered. Current. |
| **Implementation plan** | [`docs/plans/2026-06-02-freemius-mcp-cli.md`](docs/plans/2026-06-02-freemius-mcp-cli.md) | Reconciled status map. Codegen + `execute` + `call` + dynamic trio now done; remaining: `revenue_summary`, output truncation, more curated reads. |
| **Changes** | [`CHANGELOG.md`](CHANGELOG.md) | What's shipped so far. |
| **Roadmap** | [`ROADMAP.md`](ROADMAP.md) | What's next: near-term (`revenue_summary`, body validation), keyless auth (remote MCP + OAuth), MCP Apps (interactive UI). |
| **Usage** | [`README.md`](README.md) | Quick start, MCP wiring, tool table, example prompts. |
| **Agent usage** | [`AGENTS.md`](AGENTS.md) | [agents.md](https://agents.md/)-style guide for agents/users **operating** the product via the CLI/MCP (which tools, the read-only/write/confirm safety model, reading results). |
| **Contributing** | [`CONTRIBUTING.md`](CONTRIBUTING.md) | Human contributor guide — setup, dev workflow, ground rules, recipes, commit/PR conventions. (This file is the agent-facing architecture map.) |
| **Build helpers** | [`.claude/skills/freemius-mcp-engineer/`](.claude/skills/freemius-mcp-engineer/SKILL.md) + [`.claude/agents/freemius-surgeon.md`](.claude/agents/freemius-surgeon.md) | Project skill (recipes for adding entities/writes/MCP tools) and a TDD-first implementer subagent. Invoke the skill before non-trivial changes. |
| **Use the MCP** | [`.claude/skills/freemius-revenue-report/`](.claude/skills/freemius-revenue-report/SKILL.md), [`.claude/skills/freemius-customer-lookup/`](.claude/skills/freemius-customer-lookup/SKILL.md) | Usage skills that drive the connected `freemius` MCP server (per-currency revenue reports; 360° customer lookup). |

## 3. Quick Start

```bash
bun install
cp .env.example .env        # fill FREEMIUS_PRODUCT_ID + FREEMIUS_API_KEY (+ optional secret/public)
bun run dev:cli -- --help   # CLI
bun run dev:mcp             # MCP server (stdio)

bun run test                # full vitest run (msw-mocked, no live API)
bun run vitest run test/core/auth.test.ts          # a single test file
bun run vitest run -t "throws when write mode is off"   # a single test by name
bun run vitest                                      # watch mode
bun run typecheck && bun run lint
bun run build               # bun bundler → dist/{cli,mcp}/index.js (node-compatible bins)

bun run scripts/live-check.ts       # one safe live read against the real API
bun run scripts/live-mcp-check.ts   # spawn the MCP server over stdio and exercise it
```

## 4. Architecture

```
src/
  core/        # shared engine
    auth.ts        # resolveCredentials (flags > env > profile) + loadProfile; MissingCredentialError
    freemius.ts    # createFreemius → SDK client + `canSign` (placeholder-secret fallback, see §6)
    raw-client.ts  # SOLE consumer of api.__unstable_ApiClient (via unstableClient()); rawRequest(...) w/ AbortSignal timeout
    result.ts      # Result<T> = {ok,data} | {ok:false,error:{code,message,status?}} + ok()/err()
    entities.ts    # READ_ENTITIES registry + generic getEntity/listEntity — ALL reads go raw → honest Result
    guards.ts      # assertWriteEnabled (fail-closed) + assertConfirmed (echo target id)
    timeout.ts     # withTimeout + REQUEST_TIMEOUT_MS; format.ts # redactSecrets + errorEnvelope + FreemiusApiError
    catalog/validators/schema  # GENERATED stubs (codegen not built yet — §9)
  cli/         # commander → bin `freemius`; commands/reads.ts (registry-driven reads) + subscriptions.ts (cancel) + coupons.ts (create)
  mcp/         # @modelcontextprotocol/sdk stdio server → bin `freemius-mcp`; tools/curated.ts (read loop + write tools)
```

Reads are **data-driven**: one `READ_ENTITIES` registry drives both a CLI loop and an MCP loop, so
adding a read entity is a one-line registry entry. Writes (`cancelSubscription`, `createCoupon`) are
explicit handlers. All handlers return `Result<T>` and are **reused by both** surfaces, so behavior is
identical. The CLI uses `parseAsync` + a top-level error boundary; `--dry-run` previews mutations
without calling the API; `--profile` loads `~/.config/freemius/config.json`.

## 5. Conventions (follow these)

- **TDD, always.** Red → green → refactor. Tests are Vitest + **msw** (mock Freemius at the fetch
  layer); never hit the live API in tests.
- **Exact SDK pin.** `@freemius/sdk` stays `0.3.0` (no caret). Bumps are reviewed PRs (re-run the
  `__unstable_` smoke test in `test/sdk-isolation.test.ts`).
- **`raw-client.ts` is the only file that touches `api.__unstable_ApiClient`.** Pass the **template**
  path + `{path,query}` separately — never pre-interpolate.
- **Fail-closed writes.** Any mutation refuses unless write mode is on; destructive ones also require
  `confirm` echoing the id. The confirm guards a fat-finger, **not** prompt injection (§7).

## 6. Gotchas (learned the hard way — verified against sdk 0.3.0)

- **`new Freemius()` requires `secretKey` ≥ 32 chars** even for Bearer reads (its `AuthService`
  throws). `createFreemius` injects a placeholder when none is given and gates signed-URL ops on
  `canSign`. So api-key alone is enough for the read/write majority.
- **The SDK `user` service appends a `fields=` param that returns HTTP 500 on the live API** and is
  silently swallowed to `[]`. We read **users via the raw client** (no `fields`), guarded by a test.
- **SDK services swallow errors** (`retrieveMany` → `[]`, `retrieve`/`cancel` → `null` on any
  non-2xx). Curated reads surface a clear not-found; anything needing a real error code uses the raw
  path. Test against mocks **and** verify live — mocks hid the `fields` 500.
- **Plans / coupons / installs have no SDK service** — they go through `raw-client`.
