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
  CLI and MCP. 8 read-only MCP tools with `readOnlyHint` annotations.
- **Raw client** — `rawRequest`, the sole `api.__unstable_ApiClient` consumer, for entities with no
  SDK service (plans).
- **Writes behind a fail-closed gate (spec §7)** — `cancel_subscription` (CLI + MCP). Refused unless
  write mode is on (`--write` / `FREEMIUS_MCP_ALLOW_WRITE=1`) **and** a `confirm` arg echoes the
  target id. Tool carries `destructiveHint`.

### Fixed

- **User reads via the raw client.** The SDK's `user` service appends a `fields=` query param that
  returns HTTP 500 on the live API (silently swallowed to `[]`). Users now read without it, guarded
  by a test asserting the param is never sent.

### Notes

- Read-only by default. Developer-scope operations (plan/pricing writes, etc.) are out of scope in
  v1 — they require a login/2FA flow the SDK does not implement.
- `secretKey` is optional for us but required by the SDK constructor (≥ 32 chars); a placeholder is
  injected when absent so api-key-only reads work.
