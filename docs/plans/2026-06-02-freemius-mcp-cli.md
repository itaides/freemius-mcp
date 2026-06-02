# Freemius CLI + MCP — Implementation Plan (reconciled)

- **Original:** 2026-06-02 (task-by-task plan, since overtaken by the build)
- **Reconciled:** 2026-06-03 against the shipped code and the current
  [design spec](../specs/2026-06-02-freemius-mcp-cli-design.md) + [CLAUDE.md](../../CLAUDE.md)
- **Status:** v1 **complete** — phases 0–4 done (differently from the original), including the codegen
  spine, `execute`, the `call` command, and the dynamic MCP trio (full 140-op coverage). Remaining:
  `revenue_summary`, request-body validation, output truncation, a few curated reads.

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
| **P2 T5** param validation + generic `execute` | ✅ done (path/query presence; body validation deferred) | `core/execute.ts` |
| **P2 T6** output formatting | ⚠️ partial — redaction done, **truncation not** | `core/format.ts` |
| **P3 T7** CLI skeleton + error boundary | ✅ done (no `mcp` launcher subcommand) | `cli/index.ts` |
| **P3 T8** data-driven reads + guarded writes | ✅ done (registry + `Result`) | `cli/commands/reads.ts`, `subscriptions.ts`, `coupons.ts`, `core/entities.ts` |
| **P3 T9** generic `call` command | ✅ done | `cli/commands/call.ts` |
| **P1 T2** codegen (catalog + schema) | ✅ done (validators folded into the catalog) | `scripts/generate.ts`, `core/catalog.ts`, `core/schema.d.ts` |
| **P4 T10** MCP skeleton + registration | ✅ done | `mcp/index.ts` |
| **P4 T11** curated tools | ✅ done **minus `revenue_summary`** | `mcp/tools/curated.ts` |
| **P4 T12** dynamic trio (search/describe/execute) | ✅ done | `mcp/tools/dynamic.ts` |
| **P5 T13/T14** smoke, docs | ✅ done | `scripts/live-*.ts`, `README.md`, `CHANGELOG.md` |

## Remaining work

The codegen spine, `execute`, the `call` command, and the dynamic MCP trio are **done** (✅ above) —
full 140-op coverage ships. What's left:

### 1. `revenue_summary` (spec §7 — the two correctness rules are non-negotiable)
Bounded client-side aggregation. **Do not use `iterateAll`** — its own pager that distinguishes an empty
successful page (stop) from a failed page (**throw / flag `partial`**, never silently truncate). **Group by
currency**, never sum across. MRR deferred. (`Result`-shaped.)

### 2. Request-body validation for `execute`
The catalog carries `requestBodyProps` (names) but no per-field `required`/type, so `execute` presence-checks
path/query only; malformed bodies surface as the API's own 4xx. Add JSON-Schema-per-op (from the OpenAPI
request bodies) + `ajv` to validate bodies before sending (spec §9 acceptance: round-trip a sample payload).

### 3. Smaller follow-ups
- `core/format.ts` **list truncation** with a `…(N more, use --offset)` footer + a hard `--all` page cap.
- More curated reads — `licenses`, `coupons` (read) — each a **one-line `READ_ENTITIES` entry** now.
- Optional `freemius mcp` launcher subcommand (parity with the `freemius-mcp` bin).
- Single-source check: pin `openapi.yaml` by hash to the SDK's upstream spec URL; CI fails on drift.

## Conventions (current — supersede the original "Conventions for every task")

- **TDD** (Vitest + **msw**; never hit the live API in tests). Verify: `bun run typecheck && bun run lint && bun run test`.
- **Bun** for everything; `main` branch; commits end with the `Co-Authored-By` trailer.
- `@freemius/sdk` pinned **exact**; only `raw-client.ts` touches `__unstable_ApiClient` (via `unstableClient()`).
- Every handler returns **`Result<T>`**; reads are added via the `READ_ENTITIES` registry.
- **Fail-closed** writes; `--dry-run` previews without calling the API.
- Use the `.claude/skills/freemius-mcp-engineer` skill + `freemius-surgeon` agent for non-trivial changes.
