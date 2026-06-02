# Changelog

All notable changes to `@eventimio/freemius-mcp` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Project scaffold** — standalone repo on Bun, depending on the published `@freemius/sdk` (exact
  `0.3.0`). CLI (`freemius`) + MCP (`freemius-mcp`) bins, codegen scripts, and an SDK-isolation smoke
  test that fails loudly if `api.__unstable_ApiClient` ever disappears upstream.
- **Auth (spec §8)** — `resolveCredentials` with `flags > env > profile` precedence,
  `MissingCredentialError` for absent `productId`/`apiKey`, optional `secretKey`/`publicKey`, and
  `loadProfile` for `~/.config/freemius/config.json`.
- **Client** — `createFreemius` builds the SDK client with a `canSign` flag; signed-URL ops are gated
  on a real secret + public key.
- **Curated reads** — `subscriptions`, `users`, `payments`, `plans` (`get` + `list`) across both the
  CLI and MCP, with `readOnlyHint` annotations.
- **Raw client** — `rawRequest`, the sole `api.__unstable_ApiClient` consumer (isolated to one
  `unstableClient()` cast), now the path for **all** reads and for entities with no SDK service.
- **Writes behind a fail-closed gate (spec §7)** — `cancel_subscription` and `create_coupon` (CLI +
  MCP). Refused unless write mode is on (`--write` / `FREEMIUS_MCP_ALLOW_WRITE=1`); destructive ops
  additionally require a `confirm` arg echoing the target id.
- **Unified `Result<T>`** — every handler returns `{ ok, data } | { ok: false, error }`. Reads are
  data-driven from a `READ_ENTITIES` registry (one CLI loop + one MCP loop); adding a read entity is a
  one-line registry entry.

### Fixed

- **User reads via the raw client.** The SDK's `user` service appends a `fields=` query param that
  returns HTTP 500 on the live API (silently swallowed to `[]`). Users now read without it, guarded
  by a test asserting the param is never sent.
- **All reads go raw, so failures are honest.** SDK services swallow non-2xx to `[]`/`null`; routing
  every read through the raw client surfaces a real `{ ok: false, error }` instead of an empty list.
- **`--dry-run` is now respected** — it was accepted but ignored, so a "dry" cancel actually mutated.
  Mutations now print the planned request and exit without calling the API.
- **`--profile` now loads** `~/.config/freemius/config.json` (was a silent no-op) — also the
  "auth without env vars" path.
- **CLI error boundary** — `parseAsync` + top-level catch + `unhandledRejection`; network/timeout
  errors print a clean, **secret-redacted** envelope instead of a raw stack trace.
- **Request timeouts** — `AbortSignal.timeout` on the raw path, `withTimeout` around SDK calls; a hung
  connection can no longer stall a CLI command or an MCP tool call.

### Notes

- Read-only by default. Developer-scope operations (plan/pricing writes, etc.) are out of scope in
  v1 — they require a login/2FA flow the SDK does not implement.
- `secretKey` is optional for us but required by the SDK constructor (≥ 32 chars); a placeholder is
  injected when absent so api-key-only reads work.
