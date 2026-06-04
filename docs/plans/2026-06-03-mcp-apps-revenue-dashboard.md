# MCP Apps — Revenue Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layer an interactive `ui://` revenue dashboard onto the existing read-only `revenue_summary` MCP tool, with automatic text fallback for hosts without MCP Apps support.

**Architecture:** Upgrade `revenue_summary` in place — the tool advertises `_meta.ui.resourceUri` and returns `structuredContent` alongside today's text `content`. A new isolated "apps layer" module (`src/mcp/ui/revenue/register.ts`) owns both the tool and the `ui://` resource. The iframe UI is bundled (`target: browser`) into a **generated TypeScript string module** that the MCP bin imports — no `dist/` runtime file read, no path resolution. The revenue engine (`core/revenue.ts`) is untouched.

**Tech Stack:** Bun (bundler/runtime), TypeScript, `@modelcontextprotocol/sdk` (MCP), `@modelcontextprotocol/ext-apps@1.7.3` (MCP Apps helpers, server `./server` + client `App`), zod v4, Vitest + msw.

**Spec:** `docs/specs/2026-06-03-mcp-apps-revenue-dashboard-design.md`

**Verified API facts (do not re-derive):**
- `RESOURCE_MIME_TYPE === "text/html;profile=mcp-app"`.
- `registerAppTool(server, name, config, cb)` where `config` includes `_meta: { ui: { resourceUri } }`; the listed tool's `_meta` comes back as `{ ui: { resourceUri }, "ui/resourceUri": resourceUri }`.
- `registerAppResource(server, name, uri, config, readCallback)`; `readCallback` returns `{ contents: [{ uri, mimeType, text }] }`.
- `client.callTool(...)` returns `{ content, structuredContent, isError? }`. `client.listResources()` → `{ resources: [{ uri, mimeType }] }`. `client.readResource({ uri })` → `{ contents: [{ uri, mimeType, text }] }`.
- ext-apps root `.` (`App`) and `./server` are React-free; no `react`/`react-dom` needed.
- `@modelcontextprotocol/ext-apps@1.7.3` is already installed as a `dependency` (committed in `ca90af4`).

---

## File Structure

| File | Responsibility |
| :--- | :--- |
| `src/mcp/ui/revenue/app/main.ts` (create) | The iframe view: vanilla-DOM `App` client; renders `structuredContent`; day-window buttons call `revenue_summary`. **Browser code.** |
| `src/mcp/ui/revenue/app/tsconfig.json` (create) | DOM-lib tsconfig for the browser app (root tsconfig has no DOM lib). |
| `src/mcp/ui/revenue/generated/dashboard-html.ts` (create, GENERATED) | `export const revenueDashboardHtml` — the self-contained HTML+JS string. Committed like other generated stubs. |
| `scripts/build-ui.ts` (create) | Bun-bundles `app/main.ts` (`target: browser`) into the generated module above. |
| `src/mcp/ui/revenue/register.ts` (create) | The apps layer: `registerRevenueApp(server, client)` — the `revenue_summary` tool (with `_meta.ui` + `structuredContent` + `outputSchema`) and the `ui://` resource. |
| `src/mcp/index.ts` (modify) | Call `registerRevenueApp(server, client)`. |
| `src/mcp/tools/curated.ts` (modify) | Remove the `revenue_summary` block + its `revenueSummary` import (moves to the apps layer). |
| `test/mcp/revenue-app.test.ts` (create) | Tool + resource behavior tests. |
| `test/mcp/curated.test.ts` (modify) | Remove the moved `revenue_summary` describe block. |
| `test/ext-apps-isolation.test.ts` (create) | Smoke test pinning the ext-apps API surface. |
| `tsconfig.json` (modify) | Exclude the browser app dir; run the app tsconfig in `typecheck`. |
| `biome.json` (modify) | Ignore the generated HTML module. |
| `package.json` (modify) | `generate:ui` script; update `typecheck` + `prepublishOnly`. |
| `CHANGELOG.md`, `ROADMAP.md`, `README.md`, `AGENTS.md` (modify) | Docs. |

---

## Task 1: Browser app source + its tsconfig

**Files:**
- Create: `src/mcp/ui/revenue/app/main.ts`
- Create: `src/mcp/ui/revenue/app/tsconfig.json`
- Modify: `tsconfig.json` (add app dir to `exclude`)

- [ ] **Step 1: Create the iframe app**

Create `src/mcp/ui/revenue/app/main.ts`:

```ts
// main.ts — the MCP Apps iframe view for revenue_summary. Bundled (target:browser) by
// scripts/build-ui.ts into a self-contained HTML string at ../generated/dashboard-html.ts.
// Vanilla DOM, no framework, no network beyond the host bridge (app.callServerTool).

import { App } from '@modelcontextprotocol/ext-apps';

interface CurrencyTotals {
    gross: number;
    refunds: number;
    net: number;
    count: number;
}

interface RevenueSummary {
    window: { from: string; to: string };
    pagesFetched: number;
    capped: boolean;
    partial?: boolean;
    byCurrency: Record<string, CurrencyTotals>;
}

const app = new App({ name: 'freemius-revenue-dashboard', version: '0.1.0' });
const root = document.getElementById('root');

function money(value: number): string {
    return value.toFixed(2);
}

function bar(label: string, value: number, max: number, cls: string): string {
    const width = (Math.abs(value) / max) * 100;
    return (
        `<div class="bar-row"><span class="bar-label">${label}</span>` +
        `<span class="bar"><span class="bar-fill ${cls}" style="width:${width}%"></span></span>` +
        `<span class="bar-val">${money(value)}</span></div>`
    );
}

function render(summary: RevenueSummary | undefined): void {
    if (!root) {
        return;
    }
    if (!summary || Object.keys(summary.byCurrency).length === 0) {
        root.innerHTML = '<p class="empty">No payments in this window.</p>';
        return;
    }
    const flags: string[] = [];
    if (summary.capped) {
        flags.push('window capped — there may be more data');
    }
    if (summary.partial) {
        flags.push('partial — a page failed mid-sweep');
    }
    const cards = Object.entries(summary.byCurrency)
        .map(([currency, totals]) => {
            const max = Math.max(totals.gross, totals.refunds, Math.abs(totals.net), 1);
            return (
                `<section class="card"><h2>${currency.toUpperCase()} <small>${totals.count} payments</small></h2>` +
                bar('Gross', totals.gross, max, 'gross') +
                bar('Refunds', totals.refunds, max, 'refunds') +
                bar('Net', totals.net, max, 'net') +
                '</section>'
            );
        })
        .join('');
    root.innerHTML =
        `<header><span class="window">${summary.window.from} → ${summary.window.to}</span></header>` +
        (flags.length ? `<p class="flags">⚠ ${flags.join(' · ')}</p>` : '') +
        `<div class="cards">${cards}</div>`;
}

// Register BEFORE connect() so the initial tool result is not missed.
app.ontoolresult = (params) => {
    render(params.structuredContent as RevenueSummary | undefined);
};

for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-days]'))) {
    btn.addEventListener('click', async () => {
        const days = Number(btn.dataset.days);
        const result = await app.callServerTool({ name: 'revenue_summary', arguments: { days } });
        render(result.structuredContent as RevenueSummary | undefined);
    });
}

void app.connect();
```

- [ ] **Step 2: Create the app's DOM-lib tsconfig**

The root `tsconfig.json` has `lib: ["ES2023"]` (no DOM) and `types: ["node"]`. The browser app needs DOM and must NOT pull node types. Create `src/mcp/ui/revenue/app/tsconfig.json`:

```json
{
    "extends": "../../../../../tsconfig.json",
    "compilerOptions": {
        "lib": ["ES2023", "DOM", "DOM.Iterable"],
        "types": [],
        "noEmit": true
    },
    "include": ["."]
}
```

- [ ] **Step 3: Exclude the browser app from the root tsconfig**

In `tsconfig.json`, change the `exclude` line:

```json
    "exclude": ["dist", "node_modules", "scripts", "src/mcp/ui/revenue/app"]
```

- [ ] **Step 4: Verify the browser app typechecks (and is excluded from the root project)**

Run: `bun run tsc --noEmit -p src/mcp/ui/revenue/app/tsconfig.json`
Expected: PASS, no errors (DOM globals resolve).

Run: `bun run tsc --noEmit`
Expected: PASS — the root project no longer typechecks `main.ts` (it would fail on `document` if not excluded).

- [ ] **Step 5: Commit**

```bash
git add src/mcp/ui/revenue/app/main.ts src/mcp/ui/revenue/app/tsconfig.json tsconfig.json
git commit -m "feat(mcp-apps): revenue dashboard iframe app (browser source + tsconfig)"
```

---

## Task 2: UI bundle → generated HTML string module

**Files:**
- Create: `scripts/build-ui.ts`
- Create (generated): `src/mcp/ui/revenue/generated/dashboard-html.ts`
- Modify: `package.json` (add `generate:ui`)
- Modify: `biome.json` (ignore the generated file)

- [ ] **Step 1: Write the build script**

Create `scripts/build-ui.ts`:

```ts
// build-ui.ts — bundle the revenue-dashboard iframe app (target:browser) into ONE self-contained
// HTML string, emitted as a GENERATED TS module the MCP bin imports. Run: `bun run generate:ui`.
// Generated (not a dist/ file read): no runtime path resolution, no build-order race with build.ts —
// it is a normal source import bundled into the bin.

const APP_ENTRY = 'src/mcp/ui/revenue/app/main.ts';
const OUT = 'src/mcp/ui/revenue/generated/dashboard-html.ts';
const MARKER = 'freemius-revenue-dashboard';

const CSS = [
    ':root{color-scheme:light dark;font-family:system-ui,sans-serif}',
    'body{margin:0;padding:16px;line-height:1.4}',
    'nav.windows{display:flex;gap:8px;margin-bottom:12px}',
    'nav.windows button{padding:4px 12px;border-radius:6px;border:1px solid currentColor;background:transparent;cursor:pointer;font:inherit}',
    'header .window{font-size:12px;opacity:.7}',
    'p.flags{color:#b45309;font-size:13px;margin:8px 0}',
    'p.empty{opacity:.6}',
    '.cards{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}',
    '.card{border:1px solid rgba(128,128,128,.3);border-radius:10px;padding:12px 14px}',
    '.card h2{margin:0 0 10px;font-size:16px}.card h2 small{opacity:.6;font-weight:400;font-size:12px}',
    '.bar-row{display:grid;grid-template-columns:64px 1fr 80px;align-items:center;gap:8px;margin:4px 0;font-size:13px}',
    '.bar{height:8px;background:rgba(128,128,128,.18);border-radius:4px;overflow:hidden}',
    '.bar-fill{display:block;height:100%}',
    '.bar-fill.gross{background:#2563eb}.bar-fill.refunds{background:#dc2626}.bar-fill.net{background:#16a34a}',
    '.bar-val{text-align:right;font-variant-numeric:tabular-nums}',
].join('');

const result = await Bun.build({
    entrypoints: [APP_ENTRY],
    target: 'browser',
    format: 'esm',
    minify: true,
});
if (!result.success) {
    for (const log of result.logs) {
        console.error(log);
    }
    process.exit(1);
}

const js = await result.outputs[0]!.text();

const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>Freemius Revenue</title><style>${CSS}</style></head>` +
    `<body data-app="${MARKER}">` +
    '<nav class="windows"><button data-days="30">30d</button>' +
    '<button data-days="90">90d</button><button data-days="365">365d</button></nav>' +
    '<main id="root"><p class="empty">Loading…</p></main>' +
    `<script type="module">${js}</script></body></html>`;

const banner =
    '// GENERATED by scripts/build-ui.ts — DO NOT EDIT. Run `bun run generate:ui` to regenerate.\n' +
    '// The self-contained revenue-dashboard MCP App (HTML + inlined, minified, browser-bundled JS).\n';

await Bun.write(OUT, `${banner}export const revenueDashboardHtml = ${JSON.stringify(html)};\n`);
console.log(`Wrote ${OUT} (${html.length} bytes)`);
```

- [ ] **Step 2: Add the `generate:ui` npm script**

In `package.json` `scripts`, add after the `generate` line:

```json
        "generate:ui": "bun run scripts/build-ui.ts",
```

- [ ] **Step 3: Ignore the generated file in biome**

In `biome.json`, change the `files.includes` array to:

```json
        "includes": ["**", "!src/core/schema.d.ts", "!src/core/catalog.ts", "!src/mcp/ui/revenue/generated/dashboard-html.ts"]
```

- [ ] **Step 4: Generate the bundle**

Run: `bun run generate:ui`
Expected: prints `Wrote src/mcp/ui/revenue/generated/dashboard-html.ts (NNNN bytes)` with N in the thousands; exit 0.

- [ ] **Step 5: Verify the generated module is self-contained and exports the string**

Run: `bun -e "import('./src/mcp/ui/revenue/generated/dashboard-html.ts').then(m => { const h = m.revenueDashboardHtml; console.log('len', h.length, 'marker', h.includes('freemius-revenue-dashboard'), 'inlined', h.includes('callServerTool') || h.includes('ontoolresult')); })"`
Expected: `len <several thousand> marker true inlined true` (the bundled app code is inlined — proves `main.ts` + ext-apps were bundled, not referenced externally).

- [ ] **Step 6: Commit (generated file included, like other generated stubs)**

```bash
git add scripts/build-ui.ts package.json biome.json src/mcp/ui/revenue/generated/dashboard-html.ts
git commit -m "feat(mcp-apps): build-ui bundles the dashboard into a generated HTML module"
```

---

## Task 3: ext-apps isolation smoke test

**Files:**
- Test: `test/ext-apps-isolation.test.ts`

> Like `test/sdk-isolation.test.ts`, this is a guard test — it passes immediately (the dep is installed) and fails loudly only if a future bump reshapes the API. There is no red phase; that is expected for a pinned-dependency smoke test.

- [ ] **Step 1: Write the smoke test**

Create `test/ext-apps-isolation.test.ts`:

```ts
// Isolation smoke test for the pinned @modelcontextprotocol/ext-apps (mirrors sdk-isolation.test.ts).
// Fails LOUDLY if a bump renames/removes the server helpers or the App client we depend on.

import { App } from '@modelcontextprotocol/ext-apps';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { describe, expect, it } from 'vitest';

describe('@modelcontextprotocol/ext-apps (isolation seam)', () => {
    it('exposes the server helpers we depend on', () => {
        expect(typeof registerAppTool).toBe('function');
        expect(typeof registerAppResource).toBe('function');
        expect(RESOURCE_MIME_TYPE).toBe('text/html;profile=mcp-app');
    });

    it('exposes the App client class', () => {
        expect(typeof App).toBe('function');
    });
});
```

- [ ] **Step 2: Run it**

Run: `bun run vitest run test/ext-apps-isolation.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add test/ext-apps-isolation.test.ts
git commit -m "test(mcp-apps): pin the ext-apps API surface with an isolation smoke test"
```

---

## Task 4: The apps layer — `registerRevenueApp` (TDD)

**Files:**
- Test: `test/mcp/revenue-app.test.ts`
- Create: `src/mcp/ui/revenue/register.ts`

- [ ] **Step 1: Write the failing test**

Create `test/mcp/revenue-app.test.ts`:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createFreemius } from '../../src/core/freemius.js';
import { registerRevenueApp } from '../../src/mcp/ui/revenue/register.js';

const msw = setupServer();
beforeAll(() => msw.listen({ onUnhandledRequest: 'error' }));
afterEach(() => msw.resetHandlers());
afterAll(() => msw.close());

const RESOURCE_URI = 'ui://freemius/revenue-dashboard.html';
const WINDOW = { from: '2026-01-01 00:00:00', to: '2026-04-01 00:00:00' };

async function connectClient(): Promise<Client> {
    const { client: freemius } = createFreemius({ env: { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' } });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerRevenueApp(server, freemius);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
}

function mockPayments(): void {
    msw.use(
        http.get('https://fast-api.freemius.com/v1/products/1/payments.json', () =>
            HttpResponse.json({
                payments: [
                    { gross: 100, currency: 'usd', type: 'payment' },
                    { gross: 50, currency: 'eur', type: 'payment' },
                ],
            })
        )
    );
}

describe('registerRevenueApp — tool', () => {
    it('exposes revenue_summary read-only and advertises the UI resource', async () => {
        const client = await connectClient();
        const tool = (await client.listTools()).tools.find((t) => t.name === 'revenue_summary');

        expect(tool).toBeDefined();
        expect(tool?.annotations?.readOnlyHint).toBe(true);
        expect((tool?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri).toBe(RESOURCE_URI);
    });

    it('returns both structuredContent (for the view) and text content (fallback)', async () => {
        mockPayments();
        const client = await connectClient();
        const result = await client.callTool({ name: 'revenue_summary', arguments: WINDOW });

        expect(result.isError).toBeFalsy();

        const structured = result.structuredContent as { byCurrency: Record<string, unknown> };
        expect(structured.byCurrency.usd).toEqual({ gross: 100, refunds: 0, net: 100, count: 1 });
        expect(structured.byCurrency.eur).toEqual({ gross: 50, refunds: 0, net: 50, count: 1 });

        const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
        expect(JSON.parse(text).byCurrency.usd.net).toBe(100);
    });
});

describe('registerRevenueApp — UI resource', () => {
    it('registers the ui:// resource at the MCP Apps mime type', async () => {
        const client = await connectClient();
        const dash = (await client.listResources()).resources.find((r) => r.uri === RESOURCE_URI);

        expect(dash).toBeDefined();
        expect(dash?.mimeType).toBe('text/html;profile=mcp-app');
    });

    it('serves self-contained dashboard HTML', async () => {
        const client = await connectClient();
        const read = await client.readResource({ uri: RESOURCE_URI });
        const content = read.contents[0] as { mimeType: string; text: string };

        expect(content.mimeType).toBe('text/html;profile=mcp-app');
        expect(content.text).toContain('freemius-revenue-dashboard');
        expect(content.text.length).toBeGreaterThan(500);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run vitest run test/mcp/revenue-app.test.ts`
Expected: FAIL — cannot resolve `../../src/mcp/ui/revenue/register.js` (module not created yet).

- [ ] **Step 3: Implement the apps layer**

Create `src/mcp/ui/revenue/register.ts`:

```ts
// register.ts — the "apps layer": the revenue_summary tool upgraded with an MCP Apps UI, plus the
// ui:// resource that serves the dashboard. Progressive enhancement — hosts without UI support ignore
// _meta.ui and render the text content. Reuses core/revenue.ts unchanged.

import type { Freemius } from '@freemius/sdk';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { revenueSummary } from '../../../core/revenue.js';
import { apiErrorResult } from '../../tools/curated.js';
import { revenueDashboardHtml } from './generated/dashboard-html.js';

const RESOURCE_URI = 'ui://freemius/revenue-dashboard.html';

const currencyTotals = z.object({
    gross: z.number(),
    refunds: z.number(),
    net: z.number(),
    count: z.number(),
});

// outputSchema mirrors core/revenue.ts RevenueSummary so hosts can validate structuredContent.
const revenueOutputSchema = {
    window: z.object({ from: z.string(), to: z.string() }),
    pagesFetched: z.number(),
    capped: z.boolean(),
    partial: z.boolean().optional(),
    byCurrency: z.record(z.string(), currencyTotals),
};

export function registerRevenueApp(server: McpServer, client: Freemius): void {
    registerAppTool(
        server,
        'revenue_summary',
        {
            title: 'Revenue summary',
            description:
                'Bounded, client-side revenue aggregation (gross/refunds/net) grouped by currency over a date window (default last 90 days). Renders an interactive dashboard in hosts that support MCP Apps; falls back to text elsewhere. Not an analytics endpoint — for full reporting use the Freemius dashboard.',
            inputSchema: {
                days: z
                    .number()
                    .int()
                    .positive()
                    .max(365)
                    .optional()
                    .describe('window length in days when from/to are omitted (default 90, max 365)'),
                from: z.string().optional().describe("window start, 'YYYY-MM-DD HH:mm:ss' UTC"),
                to: z.string().optional().describe("window end, 'YYYY-MM-DD HH:mm:ss' UTC"),
            },
            outputSchema: revenueOutputSchema,
            annotations: { title: 'Revenue summary', readOnlyHint: true, openWorldHint: true },
            _meta: { ui: { resourceUri: RESOURCE_URI } },
        },
        async ({ days, from, to }) => {
            const result = await revenueSummary(client, { days, from, to });
            if (!result.ok) {
                return apiErrorResult(result.error);
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
                structuredContent: result.data,
            };
        }
    );

    registerAppResource(
        server,
        'Revenue Dashboard',
        RESOURCE_URI,
        { description: 'Interactive per-currency revenue dashboard for revenue_summary.' },
        async () => ({
            contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: revenueDashboardHtml }],
        })
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run vitest run test/mcp/revenue-app.test.ts`
Expected: PASS (4 tests).

> If the `outputSchema` causes the SDK to reject the result (e.g. a structuredContent validation error in the call test), remove the `outputSchema: revenueOutputSchema,` line and the two schema consts — it is a "good citizen" nicety, not a requirement (spec §7). Re-run; the other three assertions must still pass.

- [ ] **Step 5: Commit**

```bash
git add test/mcp/revenue-app.test.ts src/mcp/ui/revenue/register.ts
git commit -m "feat(mcp-apps): registerRevenueApp — revenue_summary UI tool + ui:// resource"
```

---

## Task 5: Wire into the server; remove the old in-place tool

**Files:**
- Modify: `src/mcp/index.ts`
- Modify: `src/mcp/tools/curated.ts:16` (import) and `:72-91` (the `revenue_summary` block)
- Modify: `test/mcp/curated.test.ts:65-98` (remove the moved describe block)

- [ ] **Step 1: Register the apps layer in the server**

In `src/mcp/index.ts`, add the import after the `registerDynamicTools` import (line 11):

```ts
import { registerRevenueApp } from './ui/revenue/register.js';
```

And add the call between `registerCuratedTools` and `registerDynamicTools` (after line 20):

```ts
    registerCuratedTools(server, client, { writeEnabled });
    registerRevenueApp(server, client);
    registerDynamicTools(server, client, { writeEnabled });
```

- [ ] **Step 2: Remove the duplicate `revenue_summary` from curated.ts**

In `src/mcp/tools/curated.ts`, delete the import on line 16:

```ts
import { revenueSummary } from '../../core/revenue.js';
```

And delete the entire `revenue_summary` registration block (the comment on lines 70-71 through the `registerTool(...)` call ending on line 91) — from `// revenue_summary — a read:` down to and including the `);` that closes that `server.registerTool('revenue_summary', …)` call. Leave `cancel_subscription` and `create_coupon` intact. (`apiErrorResult` stays exported — `register.ts` imports it.)

- [ ] **Step 3: Remove the moved tests from curated.test.ts**

In `test/mcp/curated.test.ts`, delete the whole `describe('revenue_summary (read-only)', () => { … })` block (lines 65-98 in the current file). Leave the curated-reads, `cancel_subscription`, and `create_coupon` describes intact.

- [ ] **Step 4: Verify the full MCP suite passes and the tool still appears exactly once**

Run: `bun run vitest run test/mcp/`
Expected: PASS — `revenue-app.test.ts`, `curated.test.ts`, `dynamic.test.ts` all green.

Run: `bun -e "import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'; import { createFreemius } from './src/core/freemius.js'; import { registerCuratedTools } from './src/mcp/tools/curated.js'; import { registerRevenueApp } from './src/mcp/ui/revenue/register.js'; const { client } = createFreemius({ env: { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' } }); const s = new McpServer({ name: 't', version: '0' }); registerCuratedTools(s, client, { writeEnabled: false }); registerRevenueApp(s, client); console.log('registered ok'); "`
Expected: prints `registered ok` with no "tool already registered" error (confirms the tool is no longer double-registered).

- [ ] **Step 5: Commit**

```bash
git add src/mcp/index.ts src/mcp/tools/curated.ts test/mcp/curated.test.ts
git commit -m "feat(mcp-apps): move revenue_summary to the apps layer; wire into the server"
```

---

## Task 6: Docs

**Files:**
- Modify: `CHANGELOG.md`, `ROADMAP.md`, `README.md`, `AGENTS.md`

- [ ] **Step 1: CHANGELOG entry**

In `CHANGELOG.md`, under the `## [Unreleased]` heading (create an `### Added` subsection if there isn't one), add:

```markdown
- **MCP Apps — revenue dashboard.** `revenue_summary` now ships an interactive `ui://` dashboard
  (per-currency cards + inline-SVG bars, 30/90/365-day window) rendered in hosts that support
  [MCP Apps](https://apps.extensions.modelcontextprotocol.io/); other hosts get the unchanged text.
  Built on `@modelcontextprotocol/ext-apps` (exact-pinned `1.7.3`). The UI is bundled into a generated
  module (`bun run generate:ui`); no runtime file read.
```

- [ ] **Step 2: ROADMAP — flip the MCP Apps bullet**

In `ROADMAP.md`, in the "Longer-term — MCP Apps" section, change the "Revenue dashboard" bullet to mark it in progress / done:

```markdown
- **Revenue dashboard (shipped, first example)** — `revenue_summary` returns `structuredContent` +
  `_meta.ui` and serves a `ui://` per-currency dashboard; text fallback preserved. See
  `docs/specs/2026-06-03-mcp-apps-revenue-dashboard-design.md`.
```

- [ ] **Step 3: README + AGENTS note**

In `README.md` (near the tool table) and `AGENTS.md` (where reading results is described), add a one-line note:

```markdown
> `revenue_summary` renders as an interactive dashboard in hosts that support MCP Apps; everywhere
> else it returns the same text summary.
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md ROADMAP.md README.md AGENTS.md
git commit -m "docs(mcp-apps): changelog, roadmap, README/AGENTS note for the revenue dashboard"
```

---

## Task 7: Update typecheck/publish wiring + full verification

**Files:**
- Modify: `package.json` (`typecheck`, `prepublishOnly`)

- [ ] **Step 1: Typecheck the browser app in `typecheck`; regenerate UI before publish**

In `package.json` `scripts`, change `typecheck` and `prepublishOnly`:

```json
        "typecheck": "tsc --noEmit && tsc --noEmit -p src/mcp/ui/revenue/app/tsconfig.json",
        "prepublishOnly": "bun run generate:ui && bun run build"
```

- [ ] **Step 2: Run the full verification gate**

Run: `bun run typecheck`
Expected: PASS (both the root project and the browser app project).

Run: `bun run lint`
Expected: PASS (the generated module is ignored; `main.ts`, `register.ts`, tests are clean).

Run: `bun run test`
Expected: PASS — entire suite green, including `revenue-app`, `ext-apps-isolation`, and the trimmed `curated`.

Run: `bun run build`
Expected: prints `Built dist/cli/index.js` and `Built dist/mcp/index.js`, exit 0 (the generated module is bundled into the mcp bin).

- [ ] **Step 3: Smoke-test the built MCP bin serves the resource**

Run: `bun -e "import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'; import { Client } from '@modelcontextprotocol/sdk/client/index.js'; import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'; import { createFreemius } from './src/core/freemius.js'; import { registerRevenueApp } from './src/mcp/ui/revenue/register.js'; const { client } = createFreemius({ env: { FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'sk_test' } }); const s = new McpServer({ name: 't', version: '0' }); registerRevenueApp(s, client); const [st, ct] = InMemoryTransport.createLinkedPair(); const c = new Client({ name: 'c', version: '0' }); await Promise.all([s.connect(st), c.connect(ct)]); const r = await c.readResource({ uri: 'ui://freemius/revenue-dashboard.html' }); console.log('served', r.contents[0].mimeType, r.contents[0].text.length, 'bytes'); "`
Expected: `served text/html;profile=mcp-app <N> bytes` with N in the thousands.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "build(mcp-apps): typecheck the browser app; regenerate UI on prepublish"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- §3.1 progressive enhancement (in-place upgrade) → Task 4 (tool returns `content` + `structuredContent` + `_meta.ui`), Task 5 (replaces the old tool).
- §3.2 isolation (`registerRevenueApp`) → Task 4 + Task 5.
- §3.3 generated string module (not dist read) → Task 2.
- §3.4 build step / `target: browser` → Task 2; `generate:ui` + prepublish wiring → Tasks 2, 7.
- §3.5 iframe app (`ontoolresult`, `callServerTool`, per-currency cards, SVG bars, capped/partial flags, empty state) → Task 1.
- §4 dependency already added (`ca90af4`); no react → confirmed, nothing to do.
- §5 safety (read-only, empty CSP, no secrets) → Task 4 (no CSP passed; only aggregated data in `structuredContent`).
- §6 tests (structuredContent, fallback, `_meta.ui`, resource mime/html) → Task 4; isolation smoke → Task 3; acknowledged "UI JS not executed in CI" gap → unchanged (a jsdom/Playwright check remains explicitly deferred; not in this plan).
- §7 `outputSchema` → Task 4 (with a documented escape hatch if it fights the SDK).
- §8 docs → Task 6.
- DOM-lib typecheck issue (root tsconfig has no DOM lib) → Task 1 (app tsconfig) + Task 7 (`typecheck` runs it).

**Placeholder scan:** none — every code/edit step shows full content; every run step states the exact command and expected output.

**Type/name consistency:** `registerRevenueApp(server, client)`, `revenueDashboardHtml`, `RESOURCE_URI = 'ui://freemius/revenue-dashboard.html'`, marker `freemius-revenue-dashboard`, mime `text/html;profile=mcp-app`, and the `RevenueSummary`/`CurrencyTotals` shapes are used identically across the app, the generated module, `register.ts`, and the tests.

**Deferred (named, not silent):** browser-side JS is not executed by CI (Task 7 step 3 is a server-side resource smoke only); a jsdom/Playwright render test is a future follow-up per spec §6.
