# MCP Apps — Revenue Dashboard (first example)

> **Status:** design, approved 2026-06-03. First implementation of the ROADMAP "Longer-term — MCP
> Apps" track. Scope: **one** interactive UI, layered onto the existing `revenue_summary` tool.
> This design survived a battle-scarred-architect review; the five conditions from that review are
> folded in below and marked **[cond N]**.

## 1. Goal & non-goals

**Goal.** Give MCP hosts that support [MCP Apps](https://apps.extensions.modelcontextprotocol.io/)
an interactive, per-currency revenue dashboard rendered in a sandboxed iframe, while every other
host keeps receiving today's `revenue_summary` text. Learn the pattern end-to-end on the lowest-risk
(read-only) tool before applying it to writes.

**Non-goals.**
- No new analytics. The view renders exactly what `core/revenue.ts` already returns — nothing more.
- No chart library, no CDN, no external fonts, no network from the iframe (beyond the host bridge).
- No write surface. `callServerTool` from the iframe only re-runs the read-only `revenue_summary`.
- **Not** shipping user-visible value to most users today — host support for MCP Apps is still
  partial. This is a deliberate "first example / establish the pattern" exercise. **[cond 7 — named
  honestly]** For nearly every user the only observable behavior is the unchanged text fallback.

## 2. Prerequisite (verified)

`core/revenue.ts` already honors the two correctness rules (failed-page-vs-empty-page distinction
returning `revenue_partial`; strict per-currency bucketing). Confirmed before this design — we are
not decorating unproven numbers. **[cond 5]** No change to the revenue engine.

## 3. Architecture

### 3.1 Progressive enhancement, in place

The existing `revenue_summary` tool is **upgraded in place** (not duplicated):

- It advertises `_meta.ui.resourceUri = "ui://freemius/revenue-dashboard.html"`.
- Its result now carries **both** `content` (today's text JSON, for the model and as fallback) **and**
  `structuredContent` (the `RevenueSummary` object, for the view).

`_meta` is MCP passthrough, so a host that doesn't understand MCP Apps simply ignores `_meta.ui` and
renders the text — the fallback is genuinely free, not aspirational.

### 3.2 Isolation — the "apps layer"

A new module `src/mcp/ui/revenue/register.ts` exports `registerRevenueApp(server, client)`, which owns
**both** halves of the App: the `revenue_summary` tool registration *and* the `ui://…` resource. The
`revenue_summary` block **moves out of** `src/mcp/tools/curated.ts` (which returns to entity-reads +
writes only). `src/mcp/index.ts` calls `registerRevenueApp(server, client)` alongside the existing
`registerCuratedTools` / `registerDynamicTools`. The entire App is then deletable in one move.

```
src/mcp/
  index.ts                       # + registerRevenueApp(server, client)
  tools/curated.ts               # − revenue_summary block (moves to ui/revenue/register.ts)
  ui/revenue/
    register.ts                  # registers tool (w/ _meta.ui + structuredContent) + ui:// resource
    generated/dashboard-html.ts  # GENERATED — `export const revenueDashboardHtml = "<!doctype html>…"`
    app/
      index.html                 # iframe shell + mount point
      main.ts                    # App client: ontoolresult → render; day-window → callServerTool
```

### 3.3 Asset delivery — generated string module, **not** a runtime file read **[cond 1, cond 2]**

The architect review killed the "read `dist/ui/*.html` at runtime" approach for two fatal reasons:

1. `scripts/build.ts` does `rmSync('dist')` first; a UI asset built before `build` is erased, and
   `prepublishOnly`/`files:["dist"]` would ship **no** asset.
2. Runtime path resolution from the bundled `dist/mcp/index.js` (rewritten `import.meta`, `npx` temp
   dirs) diverges from the dev/test path — classic "green tests, 500 in prod."

**Resolution.** The UI bundle is emitted as a **generated TypeScript string module**
(`ui/revenue/generated/dashboard-html.ts` exporting `revenueDashboardHtml`). `register.ts` imports it
normally; it is bundled *into* the bin automatically. No `dist/` wipe race, no path resolution, no
FS read, identical in dev / test / `npx`. This matches the repo's existing codegen convention
(`core/catalog`, `validators`, `schema` are already generated modules), and is committed to git like
those generated stubs.

### 3.4 Build step

`scripts/build-ui.ts`:
1. `Bun.build({ entrypoints: ['src/mcp/ui/revenue/app/index.html' | main.ts], target: 'browser',
   minify: true })` — **`target: 'browser'`**, distinct from the node bins. **[cond 4]**
2. Inline everything into a single self-contained HTML string (inline `<script>`, inline CSS, no
   external refs).
3. Write `src/mcp/ui/revenue/generated/dashboard-html.ts` exporting that string.

Wiring:
- New npm script `"generate:ui": "bun run scripts/build-ui.ts"`.
- `scripts/build.ts` is unchanged in ordering — because the generated `.ts` is a normal source import,
  the existing node bundle picks it up with no sequencing dependency on `dist/`. Regenerate via
  `bun run generate:ui` when the UI changes (same workflow as `bun run generate` for the catalog).
- A CI/check step asserts `generate:ui` produces no diff (the committed generated file is current),
  mirroring how the catalog stays in sync.

### 3.5 The iframe app (`app/main.ts`)

```ts
import { App } from '@modelcontextprotocol/ext-apps';

const app = new App({ name: 'freemius-revenue-dashboard', version: VERSION });

// Set BEFORE connect() so the initial tool result is not missed.
app.ontoolresult = (result) => render(result.structuredContent /* RevenueSummary */);

// Day-window control (30 / 90 / 365) re-runs the read-only aggregation server-side.
function onWindowChange(days: number) {
  app.callServerTool({ name: 'revenue_summary', arguments: { days } }).then(/* render */);
}

app.connect();
```

Render: one **card per currency** (gross / refunds / net / count) plus a dependency-free **inline-SVG**
bar chart (gross vs refunds vs net per currency). Surfaces `capped` ("≥N payments — window capped")
and `partial` flags so the chart never lies about completeness. Empty state when `byCurrency` is `{}`.

## 4. Dependencies **[cond 3]**

Add `@modelcontextprotocol/ext-apps`, **exact-pinned** `1.7.3` (no caret), used both sides
(`/server` helpers + the client `App`). Its peers, verified via `npm view`:

| Peer | Status |
| :--- | :--- |
| `@modelcontextprotocol/sdk ^1.29.0` | already a dependency ✓ |
| `zod ^3.25 \|\| ^4` | already a dependency (`^4.4.3`) ✓ |
| `react` / `react-dom` (^17/18/19) | **new** — declared non-optional by ext-apps |

We write **vanilla DOM** (no React) in `main.ts`. But because ext-apps declares `react`/`react-dom`
as non-optional peers, strict installers (`npm ci`, `pnpm`) warn or fail. Decision: add `react` +
`react-dom` as **devDependencies** to satisfy the peer set cleanly. (If the implementation confirms
the `@modelcontextprotocol/ext-apps` root entry imports nothing from React, we revisit; the default
is to add them.) So this feature adds **up to 3 packages**, not "one."

## 5. Safety / security

- Read-only. `cancel_subscription` / `create_coupon` are untouched; the iframe can only call
  `revenue_summary`.
- Self-contained HTML → the resource declares **no** `_meta.ui.csp` domains (empty allowlist =
  minimal attack surface). No `fetch`, no cookies/storage access (sandboxed iframe per the spec).
- No secrets in the bundle: the UI receives only the aggregated `RevenueSummary`, never credentials.

## 6. Testing (TDD, Vitest + msw)

`test/mcp/revenue-app.test.ts`:
1. `revenue_summary` result includes `structuredContent` deep-equal to the msw-mocked `RevenueSummary`.
2. `content` text is still present and parses — **fallback intact**.
3. The tool advertises `_meta.ui.resourceUri === "ui://freemius/revenue-dashboard.html"`.
4. The `ui://…` resource is registered and serves non-empty HTML at `RESOURCE_MIME_TYPE` containing a
   known marker string.

`test/ext-apps-isolation.test.ts` **[pin + smoke test]**: a smoke test asserting `registerAppResource`,
`RESOURCE_MIME_TYPE`, and `App` still exist on the pinned `ext-apps`, mirroring
`test/sdk-isolation.test.ts`. Guards against silent breakage on a future bump.

### Acknowledged coverage gap **[cond 4]**

The suite runs in **node**; it asserts the generated HTML exists and is well-formed, but **does not
execute the iframe JavaScript** (`ontoolresult`, render, `callServerTool`). Blank-screen-on-load,
render throws, and structuredContent-shape drift in the *view* are **not** caught by CI. A jsdom or
Playwright smoke test that mounts the bundle and feeds it a `RevenueSummary` is **explicitly deferred**
to a follow-up — noted here so "tests pass" is never mistaken for "the UI renders."

## 7. structuredContent schema

Optional `outputSchema` for `revenue_summary` (some hosts validate/warn on bare `structuredContent`).
We already have the zod-able `RevenueSummary` shape in `core/revenue.ts`; declaring it is cheap.
**Decision:** declare `outputSchema` to be a good citizen. **[cond 9 / minor]**

## 8. Docs & rollout

- This spec; a `CHANGELOG.md` entry under Unreleased.
- Flip the ROADMAP "Longer-term — MCP Apps" bullet to "in progress (revenue dashboard)."
- A short note in `README.md`/`AGENTS.md` that hosts with MCP Apps support render `revenue_summary`
  as a dashboard; others get text.

## 9. Open questions (resolve during planning, none blocking)

- Does the `@modelcontextprotocol/ext-apps` **root** entry pull React, or only `/react`? (Confirms
  whether `react`/`react-dom` devDeps are strictly required — §4.)
- Bun's single-file inline-HTML output shape (one `Bun.build` call vs build + manual inline). Pick the
  simplest that yields one self-contained string.
