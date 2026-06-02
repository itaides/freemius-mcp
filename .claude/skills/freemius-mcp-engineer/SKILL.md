---
name: freemius-mcp-engineer
description: Use when adding or modifying functionality in the @eventimio/freemius-mcp repo — new curated entity reads, writes, MCP tools, CLI commands, or codegen. Encodes the project's TDD workflow, exact-SDK-pin rule, the raw-client isolation seam, the fail-closed write gate, and the non-obvious @freemius/sdk gotchas (secret-key ≥32, the user `fields=` 500 bug, error swallowing). Triggers on tasks like "add licenses list/get", "add a create_coupon write", "expose a new MCP tool", "bump the SDK".
---

# Freemius MCP Engineer

Procedural knowledge for building in the `@eventimio/freemius-mcp` codebase. Read `CLAUDE.md` first
for the architecture map; this skill is the how-to for the common tasks.

## Operating rules (non-negotiable)

- **TDD always.** Write the failing test first (Vitest + **msw**), watch it fail, then implement.
  Tests mock Freemius at the fetch layer — never hit the live API in a test.
- **`@freemius/sdk` is pinned EXACT** (`0.3.0`, no caret). A bump is a reviewed change: re-run
  `test/sdk-isolation.test.ts` (the `__unstable_ApiClient` smoke test) and the spec-drift check.
- **`src/core/raw-client.ts` is the ONLY file that may touch `api.__unstable_ApiClient`.** Pass the
  **template** path (`/products/{product_id}/x.json`) + `{ path, query }` separately — never
  pre-interpolate (openapi-fetch matches on the template).
- **Fail-closed writes.** Never register a mutation that bypasses `assertWriteEnabled`.
- **Reuse handlers across surfaces.** The CLI command and the MCP tool call the *same* `getX`/`listX`
  handler — do not duplicate API logic.
- Match existing style: 4-space indent, single quotes, 120 width, `import type` for type-only imports.
- **Verify before claiming done:** `bun run typecheck && bun run lint && bun run test`.

## Which path: SDK service vs raw client?

The SDK exposes typed services for **only** these entities: `user`, `license`, `product`,
`subscription`, `payment`, `event` (`client.api.<name>`). Everything else — **coupons, plans,
installs, carts, reviews, addons, trials** — has no service and goes through `rawRequest`.

## Recipe: add a curated entity read (e.g. `licenses`)

Copy the closest existing module as a template: `src/cli/commands/payments.ts` (SDK service) or
`src/cli/commands/plans.ts` (raw client).

1. **Test first** — `test/cli/<entity>.test.ts`, msw-mock
   `https://fast-api.freemius.com/v1/products/1/<entity>...`. Assert `getX` → `{ found, data }` /
   `{ found, id }` (via `toGetResult`) and `listX` → the array.
2. **Handlers** — `src/cli/commands/<entity>.ts`:
   - SDK service: `toGetResult(await client.api.<name>.retrieve(id), id)`;
     `client.api.<name>.retrieveMany(undefined, { count, offset })`.
   - Raw: `rawRequest(client, 'GET', '/products/{product_id}/<entity>.json', { path: { product_id: client.api.productId }, query })`, then `isOkStatus(status)` + check the array key.
3. **CLI** — export `register<Entity>(program, resolve)` with `get`/`list` subcommands; mount it in
   `src/cli/index.ts`.
4. **MCP** — add `list_<entity>` / `get_<entity>` in `src/mcp/tools/curated.ts` reusing the handlers,
   with `readOnly(...)` annotations.
5. Verify.

## Recipe: add a write (mutation)

Product-scope writes use the Bearer client (no HMAC signing needed). Use the SDK service if one
exists (`subscription.cancel`), else `rawRequest` with `'POST' | 'PUT' | 'DELETE'` + `body`.

- **Gate it in BOTH surfaces** (copy `cancel_subscription` in `subscriptions.ts` + `curated.ts`):
  - `assertWriteEnabled(writeEnabled)` — always.
  - `assertConfirmed(id, confirm)` — only for **destructive** ops (delete/cancel/deactivate).
  - CLI: `writeEnabled = Boolean(command.optsWithGlobals().write)`, `confirm` = `--confirm <id>`.
  - MCP: `writeEnabled` from `registerCuratedTools` options; `confirm` = optional zod string;
    annotations `{ readOnlyHint: false, destructiveHint: true, idempotentHint: true }`.
- Non-destructive writes (e.g. `create_coupon`) need write mode but **not** `confirm`.

## Recipe: add / change an MCP tool

`server.registerTool(name, { description, inputSchema, annotations }, handler)`.

- `inputSchema` is a **raw zod shape object** (`{ id: z.string() }`), NOT `z.object(...)`. The handler
  receives typed args.
- Return a `CallToolResult`: `jsonResult(data)` for success, `errorResult(err)` / `{ isError: true }`
  for refusals and failures.
- Test with the in-memory client↔server pattern in `test/mcp/curated.test.ts`.

## Gotchas (verified against sdk 0.3.0 — do not relearn the hard way)

- **`new Freemius()` throws if `secretKey` < 32 chars**, even for Bearer-only reads. `createFreemius`
  injects a placeholder when none is given and exposes `canSign`; gate signed-URL ops on `canSign`.
- **The SDK `user` service appends `fields=` → HTTP 500 on the live API**, silently swallowed to `[]`.
  Read users via the **raw client** (no `fields`). A test asserts the param is never sent.
- **SDK services swallow errors**: `retrieveMany` → `[]`, `retrieve`/`cancel` → `null` on *any*
  non-2xx. Curated reads surface a clear not-found; anything needing a real error code uses the raw
  path. **Test with msw AND verify live** — mocks hid the `fields` 500.
- **`revenue_summary` (when built) must not use `iterateAll`** and must group by currency — see spec §7.

## Verify

```bash
bun run typecheck && bun run lint && bun run test
bun run vitest run test/cli/<entity>.test.ts     # a single file
# optional live (reads .env; safe reads only):
bun run scripts/live-check.ts
bun run scripts/live-mcp-check.ts
```
