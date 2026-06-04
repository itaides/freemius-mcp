# Changelog

All notable changes to `@eventimio/freemius-mcp` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **MCP Apps — coupon creation form.** `create_coupon` now ships with an interactive `ui://` configuration form. It features plan selection loaded dynamically via `list_plans`, client-side validation, and a user-friendly dark/light theme dashboard with validation checks.
- **MCP Apps — customer profile card.** `get_user` now ships with an interactive `ui://` customer detail view. Features top metrics (Active Subscriptions, Active Licenses count, multi-currency LTV) and tabbed views for Subscriptions, Payments, and Licenses (with redacted license keys and active activation slots).
- **Curated read support for licenses and coupons.** Added `list_licenses`, `get_license`, `list_coupons`, and `get_coupon` curated named tools and CLI command groups.
- **MCP Apps — revenue dashboard.** `revenue_summary` now ships an interactive `ui://` dashboard
  (per-currency cards + inline-SVG bars, 30/90/365-day window) rendered in hosts that support
  [MCP Apps](https://apps.extensions.modelcontextprotocol.io/); other hosts get the unchanged text.
  Built on `@modelcontextprotocol/ext-apps` (exact-pinned `1.7.3`). The UI is bundled into a generated
  module (`bun run generate:ui`); no runtime file read.

## [0.1.0] - 2026-06-03

First usable release — a `freemius` CLI and a `freemius-mcp` server giving full **product-scope**
coverage of the Freemius API (all 140 operations), **read-only by default**, on a unified `Result<T>`
engine. Verified live against a real product; 109 tests.

### Added

- **Project scaffold** — standalone repo on Bun, depending on the published `@freemius/sdk` (exact
  `0.3.0`). CLI (`freemius`) + MCP (`freemius-mcp`) bins, codegen scripts, and an SDK-isolation smoke
  test that fails loudly if `api.__unstable_ApiClient` ever disappears upstream.
- **Auth (spec §8)** — `resolveCredentials` with `flags > env > profile` precedence,
  `MissingCredentialError` for absent `productId`/`apiKey`, optional `secretKey`/`publicKey`. The
  `~/.config/freemius/config.json` **profile** works env-free on **both** surfaces (CLI `--profile`,
  MCP `FREEMIUS_PROFILE`), so no secrets need live in env or the MCP host config.
- **Client** — `createFreemius` builds the SDK client with a `canSign` flag; signed-URL ops are gated
  on a real secret + public key (placeholder injected otherwise, so api-key-only reads work).
- **Curated reads** — `subscriptions`, `users`, `payments`, `plans` (`get` + `list`) across both the
  CLI and MCP, with `readOnlyHint` annotations, data-driven from a `READ_ENTITIES` registry.
- **Raw client** — `rawRequest`, the sole `api.__unstable_ApiClient` consumer (isolated to one
  `unstableClient()` cast), the path for **all** reads and for entities with no SDK service.
- **Unified `Result<T>`** — every handler returns `{ ok, data } | { ok: false, error }`.
- **Writes behind a fail-closed gate (spec §7)** — `cancel_subscription` and `create_coupon` (CLI +
  MCP). Refused unless write mode is on (`--write` / `FREEMIUS_MCP_ALLOW_WRITE=1`); destructive ops
  additionally require a `confirm` arg echoing the target id.
- **Codegen spine (spec §9)** — `bun run generate` parses `openapi.yaml` (Bun's native YAML, no dep)
  and emits `core/catalog.ts` (the 140-operation catalog) + `core/schema.d.ts` (`openapi-typescript`).
  Catalog metadata is derived (`safe` = GET, `destructive` = DELETE + overlay) so nothing drifts; the
  pure builder is unit-tested against a fixture.
- **Generic long-tail — full 140-operation coverage (spec §5/§7).** One `execute()` runner enforces
  the whole safety model in one place (unknown-op → scope check → **fail-closed** write gate →
  destructive `confirm` → required-param presence) and returns `Result<unknown>`. Surfaced as the CLI
  `freemius call <op> --param k=v --json '{…}' [--confirm]` (honors `--dry-run`) and the MCP dynamic
  trio `freemius_search_tools` / `freemius_describe_tool` / `freemius_execute_tool`.
- **`revenue_summary` (spec §7)** — bounded, client-side **per-currency** revenue aggregation
  (gross/refunds/net) over a date window (default 90 days). Its own pager (never `iterateAll`): a
  failed page is refused loudly or returned as a labelled partial — never read as end-of-data — and a
  `maxPages` cap surfaces `capped:true`, never silent. CLI `freemius revenue-summary` + read-only MCP
  tool `revenue_summary`.
- **Versioning** — `0.1.0` from a single source (`package.json` → `core/version.ts`), surfaced by the
  CLI `--version` and the MCP `initialize` handshake (`new McpServer({ name, version })`).

### Changed

- **Tooling: Biome replaces ESLint + Prettier.** One fast (Rust) tool + one `biome.json` instead of
  five deps and two configs. `bun run lint` → `biome check`; `bun run format` → `biome format`.

### Fixed

- **User reads via the raw client.** The SDK's `user` service appends a `fields=` query param that
  returns HTTP 500 on the live API (silently swallowed to `[]`). Users now read without it, guarded
  by a test asserting the param is never sent.
- **All reads go raw, so failures are honest.** SDK services swallow non-2xx to `[]`/`null`; routing
  every read through the raw client surfaces a real `{ ok: false, error }` instead of an empty list.
- **`--dry-run` is now respected** — it was accepted but ignored, so a "dry" cancel actually mutated.
  Mutations now print the planned request and exit without calling the API.
- **`--profile` now loads** `~/.config/freemius/config.json` on the CLI **and** the MCP server (the
  server previously read env only) — the "auth without env vars" path.
- **CLI error boundary** — `parseAsync` + top-level catch + `unhandledRejection`; network/timeout
  errors print a clean, **secret-redacted** envelope instead of a raw stack trace.
- **Request timeouts** — `AbortSignal.timeout` on the raw path, `withTimeout` around SDK calls; a hung
  connection can no longer stall a CLI command or an MCP tool call.

### Notes

- Read-only by default. Developer-scope operations (plan/pricing writes, etc.) are out of scope in
  v1 — they require a login/2FA flow the SDK does not implement; `execute` refuses them
  (`scope_unsupported`).
- **Deferred:** MRR (needs per-subscription cycle + currency); request-body field validation for the
  generic `execute` (path/query presence is checked; bodies surface the API's own 4xx).
- **Repo tooling (not shipped in the npm package):** the `freemius-mcp-engineer` skill +
  `freemius-surgeon` agent (for building this repo), and the `freemius-revenue-report` /
  `freemius-customer-lookup` skills (for *using* the connected MCP).

[Unreleased]: https://github.com/itaides/freemius-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/itaides/freemius-mcp/releases/tag/v0.1.0
