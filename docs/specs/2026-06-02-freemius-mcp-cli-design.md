# Freemius CLI + MCP — Design Spec

- **Date:** 2026-06-02
- **Status:** Approved design (revised after architecture review) — pending implementation plan
- **Repo:** **standalone** `eventimio/freemius-mcp` — *not* a fork. Depends on the published
  `@freemius/sdk` (MIT) as an exact-pinned npm dependency (see §2, §10).
- **Package:** `@eventimio/freemius-mcp`, single package / two bins (see §4, §11). Drafting of the
  spec happens in a `feat/cli-mcp` branch of the `freemius-js` fork; the package itself ships from
  its own repo.

## 0. Revision note

This spec was interrogated in an architecture review on 2026-06-02. Two capabilities in the
first draft were not deliverable on the chosen foundation and have been re-scoped here:

- **Plan & pricing _writes_ are developer-scope** (`/developers/{developer_id}/…`) and are
  **not** reachable with `@freemius/sdk` (Bearer + product-scope signing only, no developer
  login). → **Cut from v1; reads only.** See §3, §8.
- **There is no revenue/analytics endpoint** in the Freemius API. → `revenue_summary` is
  redefined as a bounded, client-side aggregation, not an endpoint. See §7.

A second-round review (2026-06-02) raised API rate-limiting / 429 backoff as a concern. It is
**descoped, by design**: this MCP is installed by a single product admin on their own machine as
an ergonomic replacement for clicking around the Freemius dashboard — not a multi-tenant service.
Usage is low-volume and sequential, so no retry/backoff/rate-budget infrastructure is warranted.
The one place transient errors *did* bite — silent under-counting in `revenue_summary` — is a
correctness bug, not a load bug, and is fixed independently of rate-limiting (see §7).

Other review outcomes baked in below: read-only-by-default MCP with explicit write opt-in, a
**fail-closed** write gate (read-only allowlist, not a destructive denylist) + MCP annotations, an
isolation adapter + version pin for the SDK's `__unstable_` client whose seam preserves
`openapi-fetch` template paths, runtime validation via generated **zod v4 (or ajv)**, a structured
error contract that is honest about which path can produce it, and a resolved distribution story.

## 1. Goal

Give any AI agent (and humans / CI) ergonomic control of a Freemius **product** — the way
Stripe and Polar ship official MCP tooling. Two surfaces over one engine:

1. A **CLI** (`freemius …`) — the engine, usable by humans, scripts, CI, or an agent via Bash.
2. An **MCP server** (`freemius-mcp`) — a thin wrapper over the same engine for MCP clients
   (Claude Code / Desktop / Cursor / VS Code).

Both build **on the official `@freemius/sdk`** (MIT), consumed as a normal pinned npm dependency,
inheriting auth, typing, pagination, and webhook handling rather than reimplementing them.

## 2. Why depend on `@freemius/sdk` — and why a standalone repo, not a fork

**Why the SDK (alignment).** `@freemius/sdk` (exact-pinned, see §10; single dep `openapi-fetch`)
provides the transport layer:

- **Auth** — `new Freemius({ productId, apiKey, secretKey, publicKey })`. **Product scope only**:
  Bearer (`apiKey`) for most calls; `FS {productId}:{publicKey}:{hmac}` *signed URLs* for the few
  endpoints that need them (e.g. invoice download). `ApiService.createUrl` hardcodes
  `products/{productId}/` — there is no developer-scope client.
- **Typed API client** — `openapi-fetch` over `api/schema.d.ts` (generated from the same OpenAPI
  spec). Reachable for arbitrary product-scope paths via `api.__unstable_ApiClient` (see §5/§10).
- **Curated typed services** — `api.user`, `api.license`, `api.product`, `api.subscription`,
  `api.payment`, `api.event`, each with `iterateAll()` pagination (`PAGING_MAX_LIMIT = 50`).
- **Webhooks / checkout / entitlements / customer portal** — already implemented.

The decisive reason is the **HMAC signing** in `ApiService.generateAuthorizationParams` —
security-sensitive crypto (signed, time-bounded URLs) we must never reimplement. Auth + signing +
webhook verification alone justify the dependency, independent of the typed services.

**Why a standalone repo, not a fork (decided after the org review).** As of 2026-06-02 there is **no
official Freemius CLI or MCP** (the org ships `freemius-js`, `freemius-ai`, WP/PHP SDKs — no MCP), so
this fills a real gap rather than duplicating one. We build it as its **own repo** depending on the
*published* `@freemius/sdk`, **not** as a fork with `workspace:*`, because the fork carries two costs
the rest of this spec works hard to avoid:

- **Source-vs-published drift.** A `workspace:*` fork builds against SDK *source* while the published
  `@eventimio/freemius-mcp` depends on a published SDK *version* — so we'd test against one client and
  ship against another, and the thing that differs is exactly the fragile `__unstable_ApiClient`
  linchpin. A plain pinned dependency makes what-we-test equal what-we-ship.
- **Perpetual merge tax.** A fork of a repo we don't control means every SDK release is
  `git merge upstream` + conflict resolution forever; a dependency makes it `npm update` + Dependabot.

We still get full API alignment (their auth, signing, types, pagination, webhooks). "Upstream-PR-ready"
is *better* served by a clean standalone package Freemius could drop into `packages/mcp` than by a
divergent fork — and given their active AI investment (`freemius-ai`, vibe-coding samples), an
adoptable, blessable artifact is the goal. We own our README, issues, and release cadence. The repo
sets up its own lightweight tooling (ESLint 9 flat config, prettier, `openapi-typescript`, `tsx`,
changesets or plain `npm version`).

## 3. API surface & scope boundary

From the vendored OpenAPI spec: **140 operations across 15 resource groups**
(installations 29, products 19, licenses 18, plans 14, users 13, coupons 12, subscriptions 6,
reviews 6, deployments 6, carts 5, payments 3, developers 3, addons 3, events 2, trials 1) and
**113 schemas**.

**Scope reachable in v1 (product scope — Bearer/signed via the SDK):** all of users, licenses,
subscriptions, payments, products, coupons (incl. **create/update/delete** — these are
product-scope: `/products/{product_id}/coupons.json`), installs, plan/pricing **reads**, carts,
reviews, addons, trials, events.

**Scope NOT in v1 (developer scope — `/developers/{developer_id}/…`, 8 paths):** plan
create/update/delete, pricing create/update/delete, developer bank account, developer email
addresses, install-sync. These require the `POST /developers/{id}/login.json` flow
(email + password + 2FA → `FSA {dev_id}:{token}`), which the SDK does not implement and which is
hostile to a headless agent. **Explicitly out of v1.** The CLI/MCP will return a clear
"developer-scope operation not supported in this version" error rather than a silent 401 if such
an op is invoked.

## 4. Package layout

Standalone repo `eventimio/freemius-mcp`; one published package, two bins.

```
freemius-mcp/              # repo root (own tooling, own release cadence)
  package.json            # @eventimio/freemius-mcp; deps: @freemius/sdk (EXACT pin, e.g. "0.3.0"),
                          #   commander, @modelcontextprotocol/sdk, zod (^4); NO workspace:* — a
                          #   normal npm dep so test-target == ship-target
  tsconfig.json
  src/
    core/                 # shared engine — single source both bins use
      freemius.ts         # build Freemius from env / ~/.config/freemius profile
      auth.ts             # resolve creds; product scope only; clear "missing credential" errors
      raw-client.ts       # SOLE wrapper of api.__unstable_ApiClient (isolation seam, see §10)
      execute.ts          # generic runner for the long tail: catalog lookup + zod validate + run
      catalog.ts          # GENERATED: [{ id, method, templatePath, scope, summary, safe, destructive }]
      schema.d.ts         # GENERATED via openapi-typescript (compile-time types)
      validators.ts       # GENERATED zod-v4/ajv validators per operation (runtime validation, see §9)
      guards.ts           # read-only default, write opt-in, fail-closed (read-only allowlist)
      format.ts           # compact JSON, list truncation w/ caps, secret redaction, error mapping
    cli/                  # commander -> bin "freemius"
      index.ts
      commands/*.ts       # subscriptions, licenses, users, installs, payments, coupons,
                          #   plans (read-only), call, mcp
    mcp/                  # @modelcontextprotocol/sdk stdio server -> bin "freemius-mcp"
      index.ts
      tools/curated.ts    # ~16 first-class named tools, each with MCP annotations
      tools/dynamic.ts    # search_tools / describe_tool / execute_tool (guarded)
  scripts/generate.ts     # regenerates schema.d.ts + catalog.ts + validators.ts from openapi.yaml
  openapi.yaml            # vendored spec (source of truth for codegen)
  bin: { freemius, freemius-mcp }
```

Single package, two bins, three internal layers. Per-bin entrypoints import only what they need
so the MCP server does not pull in `commander` and the CLI does not pull in the MCP SDK at
runtime.

## 5. Core engine (`src/core`)

- `freemius.ts` — reads env / profile, constructs the SDK `Freemius` client.
- `raw-client.ts` — **the only** place that touches `api.__unstable_ApiClient`. `openapi-fetch`
  matches requests on the **template** path (`'/products/{product_id}/coupons/{coupon_id}.json'`),
  not an interpolated string — so the seam must preserve that shape, **not** pre-substitute. Its
  signature is `rawRequest(method, templatePath, { path, query, body })`, where `path` carries the
  path params (`{ product_id, coupon_id }`) and `query` the query params; it forwards them straight
  to `client[method](templatePath, { params: { path, query }, body, querySerializer })`. `catalog.ts`
  therefore stores the **template** path, never a baked one. This keeps `openapi-fetch`'s typing and
  array query-serializer (`getQuerySerializerForArray`) intact. Isolation seam so an upstream change
  is a one-file fix (§10).
- `execute.ts` — `execute(operationId, params)`:
  1. look up the op in `catalog.ts`; reject developer-scope ops with a clear error (§3),
  2. **validate `params` at runtime against the generated zod** in `validators.ts` (§9),
  3. enforce guards: any non-GET op is **write-gated by default** (fail-closed — see §7); a
     curated read-only allowlist is the *only* thing that exempts an op,
  4. supply the product id + path/query params and call `raw-client` with the template path,
  5. inspect `result.error`/`result.response.status` and map Freemius `{ error: { code, message } }`
     → typed `FreemiusApiError`. **The raw/`execute` path is the only one that sees structured
     errors** — see the curated-path note below.
  6. paginate only when explicitly requested, with a hard page cap (§9).
- **Curated paths and the error contract (review finding).** SDK service methods swallow failures —
  `Payment.retrieveMany` returns `[]` and `Subscription.cancel` returns `null` on *any* non-2xx,
  discarding `{ error: { code, message } }`. So a curated tool built on a service **cannot** produce
  a typed `FreemiusApiError`; the agent only sees `null`/`[]` and cannot tell "not found" from
  "auth expired" from "already cancelled." We resolve this explicitly rather than pretend otherwise:
  curated **reads** may use SDK services (typed, ergonomic) and surface a generic "no result / call
  failed" without a code; curated **writes** (`cancel_subscription`, `activate_license`,
  `create_coupon`, …) and anything that needs a real error code go through `raw-client`/`execute`
  so the structured error survives. §7's `FreemiusApiError` promise applies to the raw path only.
- `format.ts` — compact JSON for agents; truncate large arrays with a `…(N more, use --offset)`
  footer; redact secret-shaped values from logs/errors.
- **Base URL:** always routed through the SDK client (`fast-api.freemius.com/v1/`). We never
  hand-build base URLs from the OpenAPI `servers` block.

## 6. CLI (`src/cli`)

- Read/lookup commands mapped to SDK services:
  `freemius subscriptions list|get`, `freemius licenses list|get`, `freemius users get|list`,
  `freemius installs list`, `freemius payments list|get`, `freemius plans list|get` **(read-only)**.
- Mutations (require write-mode, see §7): `freemius subscriptions cancel`,
  `freemius licenses activate|deactivate`, `freemius coupons create|update|delete`.
- Generic escape hatch for any product-scope op:
  `freemius call <operationId> --param k=v --json '{…}'` (validated; developer-scope ops refused).
- Global flags: `--json` (default machine output), `--product <id>`, `--profile <name>`,
  `--all` (opt-in pagination, capped), `--write` (enable mutations), `--dry-run`.
- `freemius mcp` launches the MCP server (same as the `freemius-mcp` bin).
- Config precedence: flags > env > `~/.config/freemius/config.json` profiles.

## 7. MCP server (`src/mcp`)

Stdio transport via `@modelcontextprotocol/sdk`.

**Safety model (read-only by default):**
- The server starts **read-only**. Mutations require `FREEMIUS_MCP_ALLOW_WRITE=1` (or `--write`).
- **Fail-closed, not fail-open.** OpenAPI has no "destructive" property, so we do **not** maintain a
  denylist that a newly-added upstream write could slip past. Instead the catalog marks each op
  `safe` only via an explicit **read-only allowlist** (the curated GET-backed reads); every other op
  — any non-GET, anything unknown — is treated as a write and refused unless write-mode is on. A
  smaller `destructive` set (DELETE ops + known cancel/deactivate POSTs) gates the *worst*
  operations behind a `confirm` arg in addition to write-mode.
- **What the gate actually defends against — stated honestly (review finding).** Once
  `FREEMIUS_MCP_ALLOW_WRITE=1` is set in the host config, every write tool is armed for the whole
  session, and the `confirm`-echoes-the-ID check is **defeated by any agent that read the ID from a
  prior `list_*` call** — including a prompt-injected one. So `confirm` protects against a
  fat-fingered *human*, not against a confused or injected *agent*; we do not claim otherwise. The
  real protection for irreversible actions is a human in the loop: destructive ops
  (`cancel_subscription`, coupon delete) are **CLI-first**, where the operator runs the command, and
  are exposed in MCP only when write-mode is explicitly enabled by that same operator. We accept that
  an agent with write-mode on can cancel a subscription; we make that state opt-in, loud, and
  annotated rather than pretending the echo makes it safe.
- Every tool carries MCP **annotations**: `readOnlyHint`, `destructiveHint`, `idempotentHint` so
  hosts can render safety affordances. Curated tools set these precisely; `execute_tool` is
  marked non-read-only/destructive-capable and is the narrow escape hatch, not the primary path.

**Curated named tools (~16)** — the common path, one call each, tight zod inputs + annotations:
`list_subscriptions`, `get_subscription`, `cancel_subscription` (write), `list_licenses`,
`get_license`, `activate_license` (write), `deactivate_license` (write), `get_user`, `list_users`,
`list_installs`, `list_payments`, `revenue_summary` (see below), `list_plans`, `get_plan`,
`list_coupons`, `create_coupon` (write).

**`revenue_summary` — bounded client-side aggregation, not an endpoint.** The API has no
analytics/MRR endpoint; this tool paginates `payments/list` (and `subscriptions/list`) over a
**bounded window** (default last 90 days; hard cap on pages) and computes gross/net and refunds.
It documents its window and cost, caches within a session, and refuses unbounded "all time"
requests — for full analytics it points the user to the Freemius dashboard.

Two correctness rules are non-negotiable (review finding — these are the reason this is not a
trivial sum):

- **Do not aggregate via the SDK's `iterateAll`.** `ApiBase.iterateAll` ends pagination on the
  first short page, and `Payment.retrieveMany` returns `[]` on *any* non-2xx — so a single
  transient failure mid-sweep is indistinguishable from "no more data," silently truncating the
  dataset and reporting a number **lower than reality with no error**. `revenue_summary` instead
  uses its own bounded pager against `raw-client` that distinguishes an **empty successful page**
  (status 2xx, zero rows → genuine end of data, stop) from a **failed page** (non-2xx or malformed
  → **throw**, never treat as end-of-data). On any failed page it aborts loudly: the tool returns
  an explicit error, or — if a `partial: true` flag is requested — a clearly-labelled partial
  result tagged with the last successful offset. It never returns a quietly-truncated total.
- **Never sum across currencies.** Payments carry a per-row `currency` (3-char code). Totals are
  **grouped by currency** (`{ USD: {...}, EUR: {...} }`), never collapsed into one scalar. A
  single-currency product yields one group; a multi-currency product yields several. There is no
  cross-currency FX normalization in v1 (no rate source is in scope), and the tool says so.

MRR is **deferred** from the first cut: it requires each subscription's billing cycle + amount +
currency and the same per-currency discipline; it lands once the gross/net/refund aggregation is
proven. Given §0's single-admin, low-volume profile the bounded pager stays deliberately simple —
page until a short *successful* page, throw on any error — with no queue, rate budget, or backoff.

**Dynamic trio** for the long tail (full product-scope coverage at ~3 tools of context cost):
- `freemius_search_tools(query)` → matching operation ids + summaries (fuzzy over catalog),
- `freemius_describe_tool(operationId)` → parameter schema (from generated zod/JSON schema),
  **shallow-resolved and size-bounded**: `$ref`s are flattened one level and the output is capped
  (deeply-nested schemas are summarised with a "expand `<ref>`" pointer) so a single `describe_tool`
  call can't blow the agent's context — the whole point of the 3-tool design.
- `freemius_execute_tool(operationId, params)` → validate + guard + run via `core/execute`.

Output: compact JSON, truncation, secret redaction.

## 8. Auth & configuration

Delegated to `@freemius/sdk` — **product scope only**. Env vars:

- `FREEMIUS_PRODUCT_ID` (required)
- `FREEMIUS_API_KEY` — Bearer token (product scope; covers the large majority of operations)
- `FREEMIUS_SECRET_KEY`, `FREEMIUS_PUBLIC_KEY` — enable **product-scope signed URLs** (e.g.
  invoice PDF download). These do **not** unlock developer scope (corrected from the first draft).
- `FREEMIUS_MCP_ALLOW_WRITE` — `1` to permit mutating MCP tools (default: read-only).

Optional `~/.config/freemius/config.json` named profiles. Secrets are never logged and are
redacted from error output. Developer-scope auth (login/FSA/2FA) is explicitly **out of v1**.

## 9. Codegen

`scripts/generate.ts` (`npm run generate` in the package) reads the vendored `openapi.yaml` and
emits three committed artifacts:

- `src/core/schema.d.ts` — compile-time types via `openapi-typescript` (already a root devDep).
- `src/core/catalog.ts` — the 140-op catalog:
  `{ id, method, templatePath, scope, summary, safe, destructive }`. `templatePath` is the
  un-interpolated `openapi-fetch` key (§5). `scope` (`product` | `developer`) drives the §3 refusal.
  `safe` is `true` only for ops on the **read-only allowlist**; everything else is write-gated
  (fail-closed, §7). `destructive` (DELETE + known cancel/deactivate POSTs) drives the extra
  `confirm` guard. `safe`/`destructive` are **hand-curated overlays** keyed by operation id, not
  inferred from OpenAPI — codegen merges them onto the generated rows and **fails the build if an op
  id is missing from the overlay**, so a new upstream op can't ship silently un-classified.
- `src/core/validators.ts` — **runtime zod (v4)** per operation. The repo is on zod `^4.0.0`
  (`packages/sdk`, `saas-kit`), and `openapi-zod-client` emits zod **v3** — so it is **not** the
  generator here. v1 uses zod v4's native path: generate JSON Schema per operation and either keep
  the JSON Schema and validate with `ajv`, or convert via a v4-compatible JSON-Schema→zod step. The
  acceptance bar: generated validators must `import { z } from "zod"` resolving to the workspace's v4
  and pass a round-trip test against a sample payload. This is what makes "validate params" in §5
  real rather than compile-time-only. **No tool is "TBD" at implementation start — pick ajv if the
  zod-v4 generator isn't proven.**

All three are committed so installs need no codegen. **Single source of truth:** the vendored
`openapi.yaml` is fetched from the *same* upstream URL the pinned `@freemius/sdk` version was
generated from (`https://freemius.com/help/documentation/api/openapi.yaml`, per the SDK's
`openapi:generate` script) and pinned by content hash next to the SDK version pin. CI regenerates
`schema.d.ts` from the vendored spec and **fails if it drifts from the committed copy**; the SDK
version pin and the spec hash are bumped together. This keeps the MCP's catalog/validators describing
the same API the pinned SDK actually calls — without needing the SDK's (unpublished) source tree.
`npm run fetch-spec` pulls the latest spec; on a Freemius update, re-fetch + regenerate + bump the
SDK pin + review the diff in one PR.

## 10. Dependency isolation, testing & CI

**SDK isolation (review condition):**
- `@freemius/sdk` is pinned to an **exact version** in `package.json`.
- `core/raw-client.ts` is the **only** consumer of `api.__unstable_ApiClient`.
- A smoke test asserts the accessor exists and returns a client with `GET`/`POST`/`PUT`/`DELETE`;
  it **fails loudly** if upstream renames or removes it. (Track an upstream issue/PR to stabilize.)

**Tests (Vitest):**
- core: auth resolution, template-path forwarding (raw-client passes `{ path, query }` to
  `openapi-fetch`, never a pre-interpolated string), **runtime validation** (generated validators
  resolve to the workspace's zod v4 / ajv and reject bad params), error mapping on the raw path,
  guard logic — **fail-closed**: an op absent from the read-only allowlist is refused without
  write-mode; `confirm` required for destructive ops — `generate.ts` output snapshot **including the
  build-fails-on-unclassified-op check**.
- `revenue_summary`: **failed-page-throws-not-truncates** (mock a mid-sweep non-2xx, assert it
  errors / flags `partial` rather than silently under-counting) and **per-currency grouping** (mixed
  USD/EUR payments never collapse to one scalar).
- curated error contract: a curated read returning `[]`/`null` surfaces "no result" (no fake code);
  a curated write failure surfaces a structured `FreemiusApiError` via the raw path.
- CLI: command parsing, `--write`/`--dry-run` behavior.
- MCP: curated tool I/O, annotation presence (`readOnlyHint`/`destructiveHint`/`idempotentHint`),
  `execute_tool` developer-scope + write-gate (fail-closed) + destructive-confirm refusals,
  `describe_tool` output stays under the size cap.
- single-source CI check: vendored `openapi.yaml` matches the pinned SDK's schema origin.
- **msw**-mocked Freemius responses + fixtures; optional live sandbox smoke test gated by env.

**Toolchain:** **Bun** (`bun@1.3.x`) is the package manager + dev runtime (`bun run dev:cli`,
`bun test`/`vitest`, `bun run build` via Bun's bundler targeting node so the published bins run under
plain `npx`/node). `tsc --noEmit` is typecheck only — Bun emits the bundle.

**CI (own repo):** `lint` / `typecheck` / `test` on PR; the `__unstable_` smoke test and the
spec-drift check (§9) gate merges; publish to npm on tag (`npm publish` / changesets, provenance on).
Renovate/Dependabot watches `@freemius/sdk`, but the **exact pin** means an SDK bump is a reviewed PR
(re-run smoke test + regen), never an automatic float.

## 11. Distribution & resolved questions

- **Repo & publish (resolved):** standalone `eventimio/freemius-mcp` repo, published as
  **`@eventimio/freemius-mcp`** (community/unofficial; README states it's not affiliated with
  Freemius). MCP config snippet: `{ "command": "npx", "args": ["-y", "@eventimio/freemius-mcp"] }`.
  Pre-publish, from-source invocation is `node dist/mcp/index.js` (or `npm link`). If Freemius adopts
  it, the clean package transplants into their `packages/mcp` and renames to `@freemius/mcp` — far
  easier than disentangling a long-lived fork.
- **Standalone vs fork (resolved):** standalone repo + pinned `@freemius/sdk` dependency, **not** a
  fork with `workspace:*` (§2) — avoids source-vs-published drift and the upstream merge tax.
- **One package vs two (resolved):** one package + two bins, lean per-bin imports (§4). Split only
  if dependency surfaces diverge later.
- **Curated tool list:** §7's ~16 tools are the starting set; revisit after dogfooding.

## 12. Out of scope (v1) & future

**Out of scope for v1:**
- Developer-scope operations (plan/pricing writes, developer bank account, email addresses,
  install-sync) — requires developer login/FSA/2FA (§3, §8).
- Webhook receiving/serving (the SDK verifies; a listener server is a later add).
- Checkout/paywall UI (lives in `@freemius/saas-kit`).
- Full historical analytics beyond the bounded `revenue_summary` (use the Freemius dashboard).

**Future — MCP Apps:** Once the core CLI/MCP is solid, an **MCP App** (sandboxed `ui://` iframe,
`@modelcontextprotocol/ext-apps`, `postMessage` transport) is a strong fit to replace the
`revenue_summary` text blob with an interactive **revenue dashboard**, and to offer a
**coupon-config form**. It's an extension to core MCP with varying host support (Claude, Claude
Desktop, VS Code Copilot, Goose, others), so it stays out of v1 and layers on later without
changing the core engine.
