# Freemius CLI + MCP — Implementation Plan (reconciled)

- **Original:** 2026-06-02 (task-by-task plan, since overtaken by the build)
- **Reconciled:** 2026-06-03 against the shipped code and the current
  [design spec](../specs/2026-06-02-freemius-mcp-cli-design.md) + [CLAUDE.md](../../CLAUDE.md)
- **Status:** Phases 0, 2–4 substantially **done** (differently from the original); the **codegen
  spine and everything downstream of it remain**.

> The original plan assumed a build that no longer exists. This document records what was actually
> built, why it diverged, and the remaining work expressed in current conventions. The spec is the
> source of truth; this plan is the roadmap for what's left.

## What changed since the original plan

| Original plan assumed | Reality |
| :--- | :--- |
| Inside the `freemius-js` **fork**, `packages/mcp`, npm workspace (`workspace:*`) | **Standalone repo** depending on the **published** `@freemius/sdk` (exact `0.3.0`) |
| `tsdown` build, npm scripts, branch `feat/cli-mcp`, no `Co-Authored-By` | **Bun** (pkg mgr + runtime + `Bun.build`), `main` branch, `Co-Authored-By` trailer |
| Curated reads via the SDK's **typed services** | **All reads go through the raw client** via a `READ_ENTITIES` registry — the SDK services swallow non-2xx and the `user` service's `fields=` param 500s live |
| Ad-hoc per-handler result shapes | One **`Result<T>`** discriminated union across get/list/cancel/create |
| (not planned) | Added by the architecture review: request **timeouts**, CLI **error boundary**, secret **redaction**, honored **`--dry-run`/`--profile`** |

## Status against the original phases

| Phase / Task | Status | Where it lives now |
| :--- | :--- | :--- |
| **P0** Scaffold | ✅ done (standalone, Bun) | repo root, `package.json`, `scripts/build.ts` |
| **P2 T3** Config + client (`canSign`) | ✅ done | `core/auth.ts`, `core/freemius.ts` |
| **P2 T4** raw-client seam + smoke test | ✅ done | `core/raw-client.ts`, `test/sdk-isolation.test.ts` |
| **P2 T5** param validation + generic `execute` | ⬜ **remaining** (needs codegen) | `core/execute.ts` is a stub |
| **P2 T6** output formatting | ⚠️ partial — redaction done, **truncation not** | `core/format.ts` |
| **P3 T7** CLI skeleton + error boundary | ✅ done (no `mcp` launcher subcommand) | `cli/index.ts` |
| **P3 T8** data-driven reads + guarded writes | ✅ done (registry + `Result`) | `cli/commands/reads.ts`, `subscriptions.ts`, `coupons.ts`, `core/entities.ts` |
| **P3 T9** generic `call` command | ⬜ **remaining** (needs catalog) | — |
| **P1 T2** codegen (catalog/validators/schema) | ⬜ **remaining** — stubs only | `scripts/generate.ts`, `core/{catalog,validators,schema}.ts` |
| **P4 T10** MCP skeleton + registration | ✅ done | `mcp/index.ts` |
| **P4 T11** curated tools | ✅ done **minus `revenue_summary`** | `mcp/tools/curated.ts` |
| **P4 T12** dynamic trio (search/describe/execute) | ⬜ **remaining** (needs catalog) | `mcp/tools/dynamic.ts` is a no-op stub |
| **P5 T13/T14** smoke, docs | ✅ done | `scripts/live-*.ts`, `README.md`, `CHANGELOG.md` |

## Remaining work (in dependency order)

Everything below the codegen spine depends on it — do the spine first.

### 1. Codegen spine — `scripts/generate.ts` (spec §9)
The linchpin. Produces three committed artifacts from a vendored `openapi.yaml`:
- `core/schema.d.ts` — `openapi-typescript` compile-time types.
- `core/catalog.ts` — the 140-op catalog `{ id, method, templatePath, scope, summary, safe, destructive }`.
  `safe`/`destructive` are a **hand-curated overlay** merged onto generated rows; **fail the build if any
  op id is unclassified** (fail-closed, spec §7).
- `core/validators.ts` — **runtime validators**. Repo is zod v4; `openapi-zod-client` emits v3, so use a
  zod-v4-native generator **or** JSON-Schema + `ajv`. Acceptance: round-trips a sample payload (spec §9).
- Single-source check: vendored spec pinned by hash to the SDK's upstream spec URL; CI fails on drift.

### 2. `core/execute.ts` — generic runner (spec §5)
`execute(operationId, params, ctx)`: catalog lookup → reject developer-scope ops → **validate params** →
**fail-closed write gate** (any non-GET refused unless `writeEnabled`; `destructive` needs confirm) →
`rawRequest` with the **template** path → map errors to `Result`/`FreemiusApiError` → bounded pagination.
Returns `Result<T>` like everything else.

### 3. CLI `call` command (spec §6) + MCP dynamic trio (spec §7)
- `freemius call <operationId> --param k=v --json '{…}'` → `execute`.
- `freemius_search_tools` (fuzzy over catalog) / `freemius_describe_tool` (**shallow-resolved,
  size-bounded** schema) / `freemius_execute_tool` (validate + guard + run). Wire into `mcp/tools/dynamic.ts`.

### 4. `revenue_summary` (spec §7 — the two correctness rules are non-negotiable)
Bounded client-side aggregation. **Do not use `iterateAll`** — its own pager that distinguishes an empty
successful page (stop) from a failed page (**throw / flag `partial`**, never silently truncate). **Group by
currency**, never sum across. MRR deferred. (`Result`-shaped.)

### 5. Smaller follow-ups
- `core/format.ts` **list truncation** with a `…(N more, use --offset)` footer + a hard `--all` page cap.
- More curated reads — `licenses`, `coupons` (read) — each a **one-line `READ_ENTITIES` entry** now.
- Optional `freemius mcp` launcher subcommand (parity with the `freemius-mcp` bin).

## Conventions (current — supersede the original "Conventions for every task")

- **TDD** (Vitest + **msw**; never hit the live API in tests). Verify: `bun run typecheck && bun run lint && bun run test`.
- **Bun** for everything; `main` branch; commits end with the `Co-Authored-By` trailer.
- `@freemius/sdk` pinned **exact**; only `raw-client.ts` touches `__unstable_ApiClient` (via `unstableClient()`).
- Every handler returns **`Result<T>`**; reads are added via the `READ_ENTITIES` registry.
- **Fail-closed** writes; `--dry-run` previews without calling the API.
- Use the `.claude/skills/freemius-mcp-engineer` skill + `freemius-surgeon` agent for non-trivial changes.
