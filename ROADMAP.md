# Roadmap

Where `@eventimio/freemius-mcp` is headed. Shipped work lives in [`CHANGELOG.md`](./CHANGELOG.md);
the design rationale is in [`docs/specs`](./docs/specs) (§12 covers the future directions below).

## Now — v1 (shipped)

CLI + MCP over the pinned `@freemius/sdk`, **full 140-operation coverage**: curated reads
(subscriptions/users/payments/plans) + guarded writes (`cancel_subscription`, `create_coupon`) + the
generic long-tail (`call` and the dynamic MCP trio), all through one fail-closed `execute` runner on a
unified `Result<T>` engine with request timeouts, secret redaction, and a generated catalog.
**Read-only by default**; local stdio; auth via env or `~/.config/freemius/config.json` profile.

## Near-term (incremental, no new architecture)

- **`revenue_summary`** — bounded, client-side aggregation (spec §7). The two correctness rules are
  non-negotiable: a dedicated pager that distinguishes an empty *successful* page from a *failed* page
  (never silently truncates), and **per-currency grouping** (never sum across currencies). MRR deferred.
- **Request-body validation** for `execute` — generate JSON-Schema-per-op from the OpenAPI request
  bodies and validate with `ajv` before sending (today only path/query presence is checked).
- **Output truncation** — large lists get a `…(N more, use --offset)` footer + a hard `--all` cap.
- **More curated reads** — `licenses`, `coupons` (read): one-line `READ_ENTITIES` entries each.
- **Single-source check** — pin `openapi.yaml` by hash to the SDK's upstream spec; CI fails on drift.

## Mid-term — keyless auth (the auth we actually want)

**Goal:** the user never pastes a key into an MCP/shell config. v1 is a *local stdio* server, for which
the MCP authorization spec (OAuth 2.1) does not apply, so env/profile is the correct pattern today. A
keyless experience requires a **remote (HTTP) MCP server** that implements MCP authorization and is
**stateful** (the spec mandates third-party credentials never transit the client).

Path:
1. **Local profile (done)** — creds live once in `~/.config/freemius/config.json`; no env vars, no
   secrets in the Claude config. Interim, but real.
2. **Hosted, multi-tenant MCP (buildable)** — a remote server where the user authenticates to *our*
   service via MCP OAuth and supplies their Freemius key **once** in a web onboarding (encrypted,
   mapped to their identity); the agent never sees it. This is a real SaaS surface.
3. **Freemius-native OAuth (blocked upstream)** — if Freemius ever exposes an OAuth authorization
   server issuing product-scoped tokens, the remote server brokers it via URL-mode elicitation. Today
   Freemius offers only static product API keys (+ developer 2FA login, out of scope), so this is not
   in our hands.

**Design hook (already in place):** `core/auth.ts` `resolveCredentials` is the single credential seam —
a future `OAuthCredentialProvider` / server-side token store plugs in there without touching the engine.

## Longer-term — MCP Apps (interactive UI from tools)

Once the core is solid, ship interactive UI via **[MCP Apps](https://apps.extensions.modelcontextprotocol.io/api/documents/overview.html)**
— an extension where servers deliver UI to hosts through **`ui://` resources rendered in sandboxed
iframes**, communicating over **JSON-RPC via `postMessage`** (no access to the host DOM/cookies/storage).

Fits two surfaces here:
- **Revenue dashboard** — replace the `revenue_summary` text blob with an interactive chart (date
  window, per-currency breakdown, drill-down) instead of a wall of JSON.
- **Coupon-config form** — a guided form for `create_coupon` (plans, discount, limits, dates) that
  validates before submitting.

How it works (server side): declare a tool's UI with `_meta.ui.resourceUri` pointing at a `ui://`
template; return results with both `content` (for the model) and `structuredContent` (for the view);
declare any external domains via CSP metadata. **Progressive enhancement** — hosts advertise UI
support; where it's unsupported the tools fall back to text, so the core engine is untouched. Host
support varies (Claude, Claude Desktop, VS Code Copilot, Goose, …), which is why this layers on last.

## Explicitly out of scope (v1)

- Developer-scope operations (plan/pricing writes, bank account, install-sync) — need developer
  login/FSA/2FA the SDK doesn't implement; `execute` refuses them with `scope_unsupported`.
- Webhook receiving/serving (the SDK verifies; a listener is a later add).
- Full historical analytics beyond bounded `revenue_summary` — use the Freemius dashboard.
