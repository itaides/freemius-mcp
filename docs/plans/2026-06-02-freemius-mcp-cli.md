# Freemius CLI + MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@eventimio/freemius-mcp` — a `freemius` CLI and a `freemius-mcp` server — inside the `freemius-js` fork, on top of `@freemius/sdk`, giving an agent product-scope control of a Freemius account.

**Architecture:** One npm-workspace package (`packages/mcp`) with three internal layers: a `core` engine wrapping the SDK (typed services for curated reads/writes + a `raw-client` seam over the SDK's `__unstable_ApiClient` for the long tail, driven by a generated operation `catalog`), a `commander` CLI, and a `@modelcontextprotocol/sdk` stdio server (curated annotated tools + a guarded search/describe/execute trio). Read-only by default; mutations require explicit write opt-in.

**Tech Stack:** TypeScript (strict, nodenext), `@freemius/sdk`, `openapi-fetch`, `zod` v4, `commander`, `@modelcontextprotocol/sdk`, `tsdown` (build), `vitest` (test), `openapi-typescript` (codegen). Reference spec: `docs/specs/2026-06-02-freemius-mcp-cli-design.md`.

---

## Conventions for every task

- Work on branch `feat/cli-mcp`. Run all commands from the repo root (`~/Desktop/freemius/freemius-js`) unless stated.
- Package-scoped commands: `npm run <script> --workspace=@eventimio/freemius-mcp`.
- Commit messages: plain, imperative, **no `Co-Authored-By` trailer** (author is the repo's git user).
- TDD: write the failing test, watch it fail, implement minimally, watch it pass, commit.
- TS is strict with `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Guard array access and avoid `undefined` in optional props.

---

## File structure

```
packages/mcp/
  package.json                      # @eventimio/freemius-mcp, deps + 2 bins + scripts
  tsconfig.json                     # extends repo style (nodenext, strict)
  tsdown.config.ts                  # builds 3 entries: cli, mcp, (index for tests)
  vitest.config.ts
  openapi.yaml                      # vendored copy of the Freemius spec (source of truth)
  src/
    core/
      env.ts          # CONFIG type + loadConfig(): env + ~/.config/freemius/config.json
      freemius.ts     # buildFreemius(config) -> @freemius/sdk Freemius
      raw-client.ts   # SOLE wrapper of api.__unstable_ApiClient; rawRequest()
      catalog.ts      # GENERATED: OPERATIONS: Operation[] (id, method, path, scope, destructive, params)
      catalog.types.ts# hand-written types for the generated catalog
      schema.d.ts     # GENERATED via openapi-typescript (compile-time types)
      params.ts       # paramsToZod(params) -> zod schema (runtime validation)
      guards.ts       # WriteMode, isDestructive(), assertAllowed()
      execute.ts      # execute(fs, opId, params, opts) -> result | FreemiusApiError
      errors.ts       # FreemiusApiError, ScopeError, ValidationError
      format.ts       # toOutput(): compact JSON, truncate lists, redact secrets
    cli/
      index.ts        # commander program; bin "freemius"
      config.ts       # resolveRuntime(flags) -> { fs, writeMode, json, dryRun }
      commands/
        resources.ts  # data-driven read/write resource commands
        call.ts       # generic `freemius call <opId>`
        mcp.ts        # `freemius mcp` -> launches server
    mcp/
      index.ts        # stdio server; bin "freemius-mcp"
      register.ts     # tool-registration helper (zod input + annotations)
      curated.ts      # ~16 curated tool definitions (data-driven)
      dynamic.ts      # search_tools / describe_tool / execute_tool
      revenue.ts      # revenue_summary bounded aggregation
  scripts/
    generate.ts       # regenerates schema.d.ts + catalog.ts from openapi.yaml
    fetch-spec.ts      # pulls latest spec to openapi.yaml
  __tests__/          # vitest specs mirror src/ paths
```

---

## Phase 0 — Scaffold

### Task 1: Scaffold the package and wire it into the workspace

**Files:**
- Create: `packages/mcp/package.json`
- Create: `packages/mcp/tsconfig.json`
- Create: `packages/mcp/tsdown.config.ts`
- Create: `packages/mcp/vitest.config.ts`
- Create: `packages/mcp/src/core/index.ts` (temporary export to make build/typecheck pass)
- Modify: root `package.json` (`workspaces` array)
- Modify: root `eslint.config.mjs` (ignore generated files)

- [ ] **Step 1: Create the package manifest**

`packages/mcp/package.json`:
```json
{
  "name": "@eventimio/freemius-mcp",
  "version": "0.0.0",
  "description": "Community CLI + MCP server for the Freemius API (unofficial).",
  "license": "MIT",
  "type": "module",
  "bin": {
    "freemius": "dist/cli/index.js",
    "freemius-mcp": "dist/mcp/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "dev": "tsdown --watch",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "generate": "tsx scripts/generate.ts",
    "fetch-spec": "tsx scripts/fetch-spec.ts"
  },
  "dependencies": {
    "@freemius/sdk": "0.3.0",
    "@modelcontextprotocol/sdk": "^1.12.0",
    "commander": "^13.0.0",
    "openapi-fetch": "^0.14.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^24.2.0",
    "openapi-typescript": "^7.8.0",
    "tsdown": "^0.14.1",
    "tsx": "^4.20.3",
    "typescript": "^5.9.2",
    "vitest": "^3.0.0",
    "yaml": "^2.6.0"
  }
}
```
Note: `@freemius/sdk` is pinned to an **exact** version (review condition: the unstable client). When verifying the actual installed MCP SDK / vitest majors, run `npm view @modelcontextprotocol/sdk version` and `npm view vitest version` and pin to the current major if these differ.

- [ ] **Step 2: Create `packages/mcp/tsconfig.json`** (mirror the SDK's strictness)
```json
{
  "compilerOptions": {
    "rootDir": "./",
    "outDir": "./dist",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "es2022",
    "lib": ["es2022"],
    "types": ["node"],
    "sourceMap": true,
    "declaration": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": false,
    "isolatedModules": true,
    "moduleDetection": "force",
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src", "scripts", "__tests__"]
}
```

- [ ] **Step 3: Create `packages/mcp/tsdown.config.ts`**
```ts
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli/index.ts', 'src/mcp/index.ts', 'src/core/index.ts'],
  format: ['esm'],
  platform: 'node',
  dts: true,
  clean: true,
});
```

- [ ] **Step 4: Create `packages/mcp/vitest.config.ts`**
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['__tests__/**/*.test.ts'], environment: 'node' },
});
```

- [ ] **Step 5: Create a temporary `src/core/index.ts`** so build/typecheck succeed before later tasks
```ts
export const PACKAGE = '@eventimio/freemius-mcp';
```

- [ ] **Step 6: Add the package to the workspace.** In root `package.json`, change:
```json
  "workspaces": ["packages/sdk", "packages/saas-kit"],
```
to:
```json
  "workspaces": ["packages/sdk", "packages/saas-kit", "packages/mcp"],
```

- [ ] **Step 7: Ignore generated files in ESLint.** In root `eslint.config.mjs`, extend the `ignores` array to include:
```js
            'packages/mcp/src/core/schema.d.ts',
            'packages/mcp/src/core/catalog.ts',
            'packages/mcp/dist/**/*',
```

- [ ] **Step 8: Install and verify**

Run: `npm install`
Then: `npm run build --workspace=@eventimio/freemius-mcp`
Expected: install succeeds; build emits `packages/mcp/dist/core/index.js`.

- [ ] **Step 9: Commit**
```bash
git add packages/mcp package.json package-lock.json eslint.config.mjs
git commit -m "feat(mcp): scaffold @eventimio/freemius-mcp package"
```

---

## Phase 1 — Codegen

### Task 2: Vendor the spec and generate the schema + operation catalog

**Files:**
- Create: `packages/mcp/openapi.yaml` (copy of the spec)
- Create: `packages/mcp/src/core/catalog.types.ts`
- Create: `packages/mcp/scripts/generate.ts`
- Create: `packages/mcp/scripts/fetch-spec.ts`
- Test: `packages/mcp/__tests__/catalog.test.ts`
- Generated: `packages/mcp/src/core/schema.d.ts`, `packages/mcp/src/core/catalog.ts`

- [ ] **Step 1: Vendor the spec**

Run: `cp ~/Downloads/openapi.yaml packages/mcp/openapi.yaml`
Expected: file exists, ~8990 lines.

- [ ] **Step 2: Define the catalog types**

`packages/mcp/src/core/catalog.types.ts`:
```ts
export type Scope = 'product' | 'developer';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
export type ParamIn = 'path' | 'query';
export type ParamType = 'string' | 'number' | 'integer' | 'boolean' | 'array';

export interface OperationParam {
  name: string;
  in: ParamIn;
  required: boolean;
  type: ParamType;
  description?: string;
}

export interface Operation {
  id: string;          // e.g. "subscriptions/list"
  method: HttpMethod;
  path: string;        // e.g. "/products/{product_id}/subscriptions.json"
  scope: Scope;        // "developer" if path starts with /developers/
  destructive: boolean;// true for DELETE or known cancel/deactivate ops
  summary: string;
  hasBody: boolean;
  params: OperationParam[];
}
```

- [ ] **Step 3: Write the failing test for the catalog generator**

`packages/mcp/__tests__/catalog.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { OPERATIONS } from '../src/core/catalog';

describe('generated catalog', () => {
  const byId = (id: string) => OPERATIONS.find((o) => o.id === id);

  it('contains ~140 operations', () => {
    expect(OPERATIONS.length).toBeGreaterThan(130);
  });

  it('marks developer-scope ops', () => {
    const createPlan = byId('plans/create');
    expect(createPlan?.scope).toBe('developer');
  });

  it('marks product-scope ops', () => {
    expect(byId('coupons/create')?.scope).toBe('product');
    expect(byId('subscriptions/list')?.scope).toBe('product');
  });

  it('flags destructive ops', () => {
    expect(byId('subscriptions/cancel')?.destructive).toBe(true);
    expect(byId('coupons/delete')?.destructive).toBe(true);
    expect(byId('subscriptions/list')?.destructive).toBe(false);
  });

  it('captures path params with required+type', () => {
    const op = byId('subscriptions/retrieve');
    const pid = op?.params.find((p) => p.name === 'product_id');
    expect(pid).toMatchObject({ in: 'path', required: true, type: 'integer' });
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npm run test --workspace=@eventimio/freemius-mcp`
Expected: FAIL — `catalog.ts` does not exist / `OPERATIONS` undefined.

- [ ] **Step 5: Write `scripts/generate.ts`**

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const specPath = resolve(root, 'openapi.yaml');
const catalogPath = resolve(root, 'src/core/catalog.ts');
const schemaPath = resolve(root, 'src/core/schema.d.ts');

const DESTRUCTIVE_HINT = /(cancel|delete|deactivate|remove|revoke)/i;

interface RawParam { name: string; in: string; required?: boolean; schema?: { type?: string } }

function toScope(path: string): 'product' | 'developer' {
  return path.startsWith('/developers/') ? 'developer' : 'product';
}

function generateCatalog(): void {
  const spec = parse(readFileSync(specPath, 'utf8')) as {
    paths: Record<string, Record<string, {
      operationId?: string; summary?: string; parameters?: RawParam[]; requestBody?: unknown;
    }>>;
  };

  const ops: unknown[] = [];
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const httpMethod = method.toUpperCase();
      if (!['GET', 'POST', 'PUT', 'DELETE'].includes(httpMethod)) continue;
      if (!op.operationId) continue;

      const params = (op.parameters ?? [])
        .filter((p) => p.in === 'path' || p.in === 'query')
        .map((p) => ({
          name: p.name,
          in: p.in,
          required: p.in === 'path' ? true : Boolean(p.required),
          type: (p.schema?.type ?? 'string'),
          ...(typeof (p as { description?: string }).description === 'string'
            ? { description: (p as { description?: string }).description }
            : {}),
        }));

      ops.push({
        id: op.operationId,
        method: httpMethod,
        path,
        scope: toScope(path),
        destructive: httpMethod === 'DELETE' || DESTRUCTIVE_HINT.test(op.operationId),
        summary: op.summary ?? op.operationId,
        hasBody: Boolean(op.requestBody),
        params,
      });
    }
  }

  const banner = '// GENERATED by scripts/generate.ts — do not edit by hand.\n';
  const body =
    `import type { Operation } from './catalog.types';\n\n` +
    `export const OPERATIONS: Operation[] = ${JSON.stringify(ops, null, 2)};\n`;
  writeFileSync(catalogPath, banner + body);
  // eslint-disable-next-line no-console
  console.log(`Wrote ${ops.length} operations to catalog.ts`);
}

function generateSchema(): void {
  execFileSync('npx', ['openapi-typescript', specPath, '-o', schemaPath], { stdio: 'inherit' });
}

generateSchema();
generateCatalog();
```

- [ ] **Step 6: Write `scripts/fetch-spec.ts`** (refresh helper)
```ts
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', 'openapi.yaml');
const URL = 'https://freemius.com/help/documentation/api/openapi.yaml';

const res = await fetch(URL);
if (!res.ok) throw new Error(`fetch-spec failed: ${res.status}`);
writeFileSync(out, await res.text());
// eslint-disable-next-line no-console
console.log(`Updated ${out}`);
```

- [ ] **Step 7: Run codegen**

Run: `npm run generate --workspace=@eventimio/freemius-mcp`
Expected: prints "Wrote 140 operations to catalog.ts"; `schema.d.ts` and `catalog.ts` created.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm run test --workspace=@eventimio/freemius-mcp`
Expected: PASS (all 5 catalog assertions).

- [ ] **Step 9: Commit**
```bash
git add packages/mcp/openapi.yaml packages/mcp/scripts packages/mcp/src/core/catalog.types.ts \
        packages/mcp/src/core/catalog.ts packages/mcp/src/core/schema.d.ts packages/mcp/__tests__/catalog.test.ts
git commit -m "feat(mcp): generate operation catalog and types from OpenAPI spec"
```

---

## Phase 2 — Core engine

### Task 3: Config loading and Freemius client construction

**Files:**
- Create: `packages/mcp/src/core/errors.ts`
- Create: `packages/mcp/src/core/env.ts`
- Create: `packages/mcp/src/core/freemius.ts`
- Test: `packages/mcp/__tests__/env.test.ts`

- [ ] **Step 1: Write `src/core/errors.ts`**
```ts
export class FreemiusApiError extends Error {
  constructor(readonly code: string, message: string, readonly status?: number) {
    super(message);
    this.name = 'FreemiusApiError';
  }
}
export class ScopeError extends Error {
  constructor(opId: string) {
    super(`Operation "${opId}" requires developer scope, which is not supported in this version.`);
    this.name = 'ScopeError';
  }
}
export class ValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ValidationError'; }
}
export class WriteModeError extends Error {
  constructor(opId: string) {
    super(`Operation "${opId}" is a write/destructive action. Enable write mode (--write or FREEMIUS_MCP_ALLOW_WRITE=1).`);
    this.name = 'WriteModeError';
  }
}
```

- [ ] **Step 2: Write the failing test**

`packages/mcp/__tests__/env.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/core/env';

describe('loadConfig', () => {
  it('reads product + api key from env', () => {
    const cfg = loadConfig({ FREEMIUS_PRODUCT_ID: '12345', FREEMIUS_API_KEY: 'sk_x' });
    expect(cfg.productId).toBe('12345');
    expect(cfg.apiKey).toBe('sk_x');
    expect(cfg.writeMode).toBe(false);
  });

  it('enables write mode from env flag', () => {
    const cfg = loadConfig({ FREEMIUS_PRODUCT_ID: '1', FREEMIUS_API_KEY: 'k', FREEMIUS_MCP_ALLOW_WRITE: '1' });
    expect(cfg.writeMode).toBe(true);
  });

  it('throws a clear error when product id is missing', () => {
    expect(() => loadConfig({ FREEMIUS_API_KEY: 'k' })).toThrow(/FREEMIUS_PRODUCT_ID/);
  });
});
```

- [ ] **Step 3: Run it — confirm FAIL** (`loadConfig` not defined).
Run: `npm run test --workspace=@eventimio/freemius-mcp -- env`

- [ ] **Step 4: Write `src/core/env.ts`**
```ts
export interface Config {
  productId: string;
  apiKey: string;
  secretKey: string;
  publicKey: string;
  writeMode: boolean;
}

type Env = Record<string, string | undefined>;

export function loadConfig(env: Env = process.env): Config {
  const productId = env.FREEMIUS_PRODUCT_ID?.trim();
  const apiKey = env.FREEMIUS_API_KEY?.trim();
  if (!productId) throw new Error('Missing FREEMIUS_PRODUCT_ID');
  if (!apiKey) throw new Error('Missing FREEMIUS_API_KEY');
  return {
    productId,
    apiKey,
    secretKey: env.FREEMIUS_SECRET_KEY?.trim() ?? '',
    publicKey: env.FREEMIUS_PUBLIC_KEY?.trim() ?? '',
    writeMode: env.FREEMIUS_MCP_ALLOW_WRITE === '1',
  };
}
```

- [ ] **Step 5: Write `src/core/freemius.ts`**
```ts
import { Freemius } from '@freemius/sdk';
import type { Config } from './env';

export function buildFreemius(config: Config): Freemius {
  return new Freemius({
    productId: config.productId,
    apiKey: config.apiKey,
    secretKey: config.secretKey,
    publicKey: config.publicKey,
  });
}
```
Note: `Freemius` requires `secretKey` ≥ 32 chars for signed features (`AuthService`). For Bearer-only read use, pass an empty string only if you avoid signed-URL features; otherwise supply the real secret/public keys. The CLI/MCP only need `secretKey`/`publicKey` for invoice-download (signed URL). Verify against `node -e "require('@freemius/sdk')"` after build if construction throws.

- [ ] **Step 6: Run — confirm PASS.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- env`

- [ ] **Step 7: Commit**
```bash
git add packages/mcp/src/core/errors.ts packages/mcp/src/core/env.ts \
        packages/mcp/src/core/freemius.ts packages/mcp/__tests__/env.test.ts
git commit -m "feat(mcp): config loading + Freemius client construction"
```

### Task 4: The raw-client isolation seam (+ unstable-accessor smoke test)

**Files:**
- Create: `packages/mcp/src/core/raw-client.ts`
- Test: `packages/mcp/__tests__/raw-client.test.ts`

- [ ] **Step 1: Write the failing smoke test (review condition: fail loudly if `__unstable_ApiClient` changes)**

`packages/mcp/__tests__/raw-client.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildFreemius } from '../src/core/freemius';
import { getRawClient } from '../src/core/raw-client';

describe('raw-client seam', () => {
  it('exposes an openapi-fetch client with HTTP verbs', () => {
    const fs = buildFreemius({
      productId: '1', apiKey: 'k',
      secretKey: 'x'.repeat(32), publicKey: 'y'.repeat(32), writeMode: false,
    });
    const client = getRawClient(fs);
    for (const verb of ['GET', 'POST', 'PUT', 'DELETE', 'request'] as const) {
      expect(typeof client[verb]).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run — confirm FAIL** (`getRawClient` not defined).
Run: `npm run test --workspace=@eventimio/freemius-mcp -- raw-client`

- [ ] **Step 3: Write `src/core/raw-client.ts`**
```ts
import type { Freemius } from '@freemius/sdk';

// The ONLY place that touches the SDK's explicitly-unstable client.
// If upstream renames/removes __unstable_ApiClient, the smoke test fails here.
export type RawClient = ReturnType<Freemius['api']['__unstable_ApiClient'] extends never ? never : () => unknown> extends never
  ? unknown
  : Freemius['api']['__unstable_ApiClient'];

export function getRawClient(fs: Freemius): Freemius['api']['__unstable_ApiClient'] {
  const client = fs.api.__unstable_ApiClient;
  if (!client || typeof client.request !== 'function') {
    throw new Error('SDK __unstable_ApiClient is missing or changed shape — pin @freemius/sdk and update raw-client.ts');
  }
  return client;
}

export interface RawResult { data?: unknown; error?: unknown; response: Response }

export async function rawRequest(
  fs: Freemius,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  init: { params?: { path?: Record<string, unknown>; query?: Record<string, unknown> }; body?: unknown },
): Promise<RawResult> {
  const client = getRawClient(fs);
  // openapi-fetch exposes a generic request() for dynamic (runtime) paths.
  return client.request(method, path, init) as Promise<RawResult>;
}
```
Note: if the `RawClient` conditional type proves awkward under strict mode, simplify to `export type RawClient = Freemius['api']['__unstable_ApiClient'];` — the runtime guard in `getRawClient` is what enforces the contract.

- [ ] **Step 4: Run — confirm PASS.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- raw-client`

- [ ] **Step 5: Commit**
```bash
git add packages/mcp/src/core/raw-client.ts packages/mcp/__tests__/raw-client.test.ts
git commit -m "feat(mcp): raw-client isolation seam with unstable-accessor smoke test"
```

### Task 5: Param validation, guards, and the generic `execute`

**Files:**
- Create: `packages/mcp/src/core/params.ts`
- Create: `packages/mcp/src/core/guards.ts`
- Create: `packages/mcp/src/core/execute.ts`
- Test: `packages/mcp/__tests__/params.test.ts`, `packages/mcp/__tests__/execute.test.ts`

- [ ] **Step 1: Write the failing test for `paramsToZod`**

`packages/mcp/__tests__/params.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { paramsToZod } from '../src/core/params';

const params = [
  { name: 'product_id', in: 'path', required: true, type: 'integer' },
  { name: 'count', in: 'query', required: false, type: 'integer' },
  { name: 'extended', in: 'query', required: false, type: 'boolean' },
] as const;

describe('paramsToZod', () => {
  it('accepts valid input and coerces types', () => {
    const schema = paramsToZod([...params]);
    const parsed = schema.parse({ product_id: '123', count: '50', extended: 'true' });
    expect(parsed).toEqual({ product_id: 123, count: 50, extended: true });
  });

  it('rejects missing required path param', () => {
    const schema = paramsToZod([...params]);
    expect(() => schema.parse({ count: 50 })).toThrow();
  });
});
```

- [ ] **Step 2: Run — confirm FAIL.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- params`

- [ ] **Step 3: Write `src/core/params.ts`**
```ts
import { z } from 'zod';
import type { OperationParam } from './catalog.types';

function leaf(type: OperationParam['type']): z.ZodTypeAny {
  switch (type) {
    case 'integer':
    case 'number':
      return z.coerce.number();
    case 'boolean':
      return z.preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean());
    case 'array':
      return z.array(z.string());
    default:
      return z.string();
  }
}

export function paramsToZod(params: OperationParam[]): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const p of params) {
    const base = leaf(p.type);
    shape[p.name] = p.required ? base : base.optional();
  }
  return z.object(shape).strip();
}
```

- [ ] **Step 4: Run — confirm PASS.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- params`

- [ ] **Step 5: Write `src/core/guards.ts`**
```ts
import type { Operation } from './catalog.types';
import { ScopeError, WriteModeError } from './errors';

export function assertAllowed(op: Operation, writeMode: boolean): void {
  if (op.scope === 'developer') throw new ScopeError(op.id);
  if (op.destructive && !writeMode) throw new WriteModeError(op.id);
}
```

- [ ] **Step 6: Write the failing test for `execute`**

`packages/mcp/__tests__/execute.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { execute } from '../src/core/execute';
import { ScopeError, WriteModeError } from '../src/core/errors';

function fakeFs(impl: () => unknown) {
  return { api: { __unstable_ApiClient: { request: vi.fn(impl), GET() {}, POST() {}, PUT() {}, DELETE() {} } } } as never;
}

describe('execute', () => {
  it('refuses developer-scope ops', async () => {
    await expect(execute(fakeFs(() => ({})), 'plans/create', {}, { writeMode: true }))
      .rejects.toBeInstanceOf(ScopeError);
  });

  it('refuses destructive ops without write mode', async () => {
    await expect(execute(fakeFs(() => ({})), 'subscriptions/cancel', { product_id: 1, subscription_id: 2 }, { writeMode: false }))
      .rejects.toBeInstanceOf(WriteModeError);
  });

  it('runs a product-scope read and returns data', async () => {
    const fs = fakeFs(() => ({ data: { subscriptions: [{ id: '9' }] }, response: { ok: true, status: 200 } }));
    const out = await execute(fs, 'subscriptions/list', { product_id: 1 }, { writeMode: false });
    expect(out).toEqual({ subscriptions: [{ id: '9' }] });
  });
});
```

- [ ] **Step 7: Run — confirm FAIL.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- execute`

- [ ] **Step 8: Write `src/core/execute.ts`**
```ts
import type { Freemius } from '@freemius/sdk';
import { OPERATIONS } from './catalog';
import type { Operation } from './catalog.types';
import { paramsToZod } from './params';
import { assertAllowed } from './guards';
import { rawRequest } from './raw-client';
import { FreemiusApiError, ValidationError } from './errors';

export interface ExecuteOpts { writeMode: boolean }

function findOp(opId: string): Operation {
  const op = OPERATIONS.find((o) => o.id === opId);
  if (!op) throw new ValidationError(`Unknown operationId: ${opId}`);
  return op;
}

function splitParams(op: Operation, validated: Record<string, unknown>) {
  const path: Record<string, unknown> = {};
  const query: Record<string, unknown> = {};
  for (const p of op.params) {
    if (!(p.name in validated)) continue;
    (p.in === 'path' ? path : query)[p.name] = validated[p.name];
  }
  return { path, query };
}

export async function execute(
  fs: Freemius,
  opId: string,
  params: Record<string, unknown>,
  opts: ExecuteOpts,
): Promise<unknown> {
  const op = findOp(opId);
  assertAllowed(op, opts.writeMode);

  const validated = paramsToZod(op.params).parse(params);
  const { path, query } = splitParams(op, validated as Record<string, unknown>);
  const body = op.hasBody ? (params.body ?? undefined) : undefined;

  const result = await rawRequest(fs, op.method, op.path, { params: { path, query }, body });
  if (!result.response.ok) {
    const err = result.error as { error?: { code?: string; message?: string } } | undefined;
    throw new FreemiusApiError(
      err?.error?.code ?? 'api_error',
      err?.error?.message ?? `Request failed with status ${result.response.status}`,
      result.response.status,
    );
  }
  return result.data;
}
```

- [ ] **Step 9: Run — confirm PASS.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- execute`

- [ ] **Step 10: Commit**
```bash
git add packages/mcp/src/core/params.ts packages/mcp/src/core/guards.ts \
        packages/mcp/src/core/execute.ts packages/mcp/__tests__/params.test.ts \
        packages/mcp/__tests__/execute.test.ts
git commit -m "feat(mcp): param validation, scope/write guards, and generic execute"
```

### Task 6: Output formatting (truncation + secret redaction)

**Files:**
- Create: `packages/mcp/src/core/format.ts`
- Test: `packages/mcp/__tests__/format.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/mcp/__tests__/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { toOutput, redact } from '../src/core/format';

describe('format', () => {
  it('truncates long arrays with a footer note', () => {
    const out = toOutput(Array.from({ length: 120 }, (_, i) => ({ id: i })), { limit: 50 });
    expect(out.truncated).toBe(true);
    expect(out.shown).toBe(50);
    expect(out.total).toBe(120);
    expect((out.data as unknown[]).length).toBe(50);
  });

  it('redacts secret-shaped keys', () => {
    const r = redact({ apiKey: 'sk_secret', nested: { secretKey: 'abc' }, ok: 1 }) as Record<string, unknown>;
    expect(r.apiKey).toBe('[REDACTED]');
    expect((r.nested as Record<string, unknown>).secretKey).toBe('[REDACTED]');
    expect(r.ok).toBe(1);
  });
});
```

- [ ] **Step 2: Run — confirm FAIL.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- format`

- [ ] **Step 3: Write `src/core/format.ts`**
```ts
const SECRET_KEY_RE = /(secret|api[_-]?key|public[_-]?key|token|password|authorization)/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_RE.test(k) ? '[REDACTED]' : redact(v);
    }
    return out;
  }
  return value;
}

export interface Output { data: unknown; truncated: boolean; shown?: number; total?: number }

export function toOutput(data: unknown, opts: { limit?: number } = {}): Output {
  const limit = opts.limit ?? 50;
  const safe = redact(data);
  if (Array.isArray(safe) && safe.length > limit) {
    return { data: safe.slice(0, limit), truncated: true, shown: limit, total: safe.length };
  }
  return { data: safe, truncated: false };
}
```

- [ ] **Step 4: Run — confirm PASS.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- format`

- [ ] **Step 5: Commit**
```bash
git add packages/mcp/src/core/format.ts packages/mcp/__tests__/format.test.ts
git commit -m "feat(mcp): output formatting with truncation and secret redaction"
```

---

## Phase 3 — CLI

### Task 7: CLI skeleton, runtime resolution, and the `mcp` launcher

**Files:**
- Create: `packages/mcp/src/cli/config.ts`
- Create: `packages/mcp/src/cli/commands/mcp.ts`
- Create: `packages/mcp/src/cli/index.ts`
- Test: `packages/mcp/__tests__/cli-config.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/mcp/__tests__/cli-config.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveWriteMode } from '../src/cli/config';

describe('resolveWriteMode', () => {
  it('flag overrides env-off', () => {
    expect(resolveWriteMode({ write: true }, { writeMode: false })).toBe(true);
  });
  it('falls back to env when no flag', () => {
    expect(resolveWriteMode({}, { writeMode: true })).toBe(true);
    expect(resolveWriteMode({}, { writeMode: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run — confirm FAIL.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- cli-config`

- [ ] **Step 3: Write `src/cli/config.ts`**
```ts
import { loadConfig, type Config } from '../core/env';
import { buildFreemius } from '../core/freemius';
import type { Freemius } from '@freemius/sdk';

export interface GlobalFlags { write?: boolean; product?: string; json?: boolean; dryRun?: boolean }
export interface Runtime { fs: Freemius; config: Config; writeMode: boolean; json: boolean; dryRun: boolean }

export function resolveWriteMode(flags: { write?: boolean }, config: { writeMode: boolean }): boolean {
  return flags.write ?? config.writeMode;
}

export function resolveRuntime(flags: GlobalFlags): Runtime {
  const env = flags.product ? { ...process.env, FREEMIUS_PRODUCT_ID: flags.product } : process.env;
  const config = loadConfig(env);
  return {
    fs: buildFreemius(config),
    config,
    writeMode: resolveWriteMode(flags, config),
    json: flags.json ?? true,
    dryRun: flags.dryRun ?? false,
  };
}
```

- [ ] **Step 4: Write `src/cli/commands/mcp.ts`**
```ts
import { Command } from 'commander';

export function registerMcpCommand(program: Command): void {
  program
    .command('mcp')
    .description('Launch the Freemius MCP server over stdio')
    .action(async () => {
      const { startServer } = await import('../../mcp/index.js');
      await startServer();
    });
}
```

- [ ] **Step 5: Write `src/cli/index.ts`**
```ts
#!/usr/bin/env node
import { Command } from 'commander';
import { registerMcpCommand } from './commands/mcp.js';
import { registerResourceCommands } from './commands/resources.js';
import { registerCallCommand } from './commands/call.js';

const program = new Command();
program
  .name('freemius')
  .description('Community CLI for the Freemius API')
  .option('--json', 'output JSON (default)', true)
  .option('--product <id>', 'override FREEMIUS_PRODUCT_ID')
  .option('--write', 'enable mutating operations')
  .option('--dry-run', 'print what would be sent without calling the API')
  .option('--all', 'paginate all pages (capped)');

registerMcpCommand(program);
registerResourceCommands(program);
registerCallCommand(program);

program.parseAsync().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
```
Note: `resources.js` and `call.js` are created in Tasks 8–9. To keep the build green, create empty stubs now that export `registerResourceCommands`/`registerCallCommand` as no-ops, then fill them in.

- [ ] **Step 6: Create stubs so the build compiles**

`src/cli/commands/resources.ts`:
```ts
import type { Command } from 'commander';
export function registerResourceCommands(_program: Command): void {}
```
`src/cli/commands/call.ts`:
```ts
import type { Command } from 'commander';
export function registerCallCommand(_program: Command): void {}
```

- [ ] **Step 7: Run — confirm PASS + build compiles.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- cli-config && npm run build --workspace=@eventimio/freemius-mcp`
Expected: test PASS; build emits `dist/cli/index.js`. (The `mcp/index.js` import resolves after Task 12; if building before then, temporarily stub `src/mcp/index.ts` with `export async function startServer() {}`.)

- [ ] **Step 8: Commit**
```bash
git add packages/mcp/src/cli packages/mcp/__tests__/cli-config.test.ts
git commit -m "feat(mcp): CLI skeleton, runtime resolution, mcp launcher command"
```

### Task 8: Data-driven resource commands (reads + guarded writes)

**Files:**
- Modify: `packages/mcp/src/cli/commands/resources.ts`
- Test: `packages/mcp/__tests__/resources.test.ts`

- [ ] **Step 1: Write the failing test (command tree shape)**

`packages/mcp/__tests__/resources.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { registerResourceCommands } from '../src/cli/commands/resources';

describe('resource commands', () => {
  it('registers subscriptions list/get/cancel', () => {
    const program = new Command();
    registerResourceCommands(program);
    const subs = program.commands.find((c) => c.name() === 'subscriptions');
    const names = subs?.commands.map((c) => c.name()) ?? [];
    expect(names).toEqual(expect.arrayContaining(['list', 'get', 'cancel']));
  });

  it('registers plans as read-only (no write subcommands)', () => {
    const program = new Command();
    registerResourceCommands(program);
    const plans = program.commands.find((c) => c.name() === 'plans');
    const names = plans?.commands.map((c) => c.name()) ?? [];
    expect(names).toEqual(expect.arrayContaining(['list', 'get']));
    expect(names).not.toContain('create');
  });
});
```

- [ ] **Step 2: Run — confirm FAIL.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- resources`

- [ ] **Step 3: Implement `src/cli/commands/resources.ts`** (data-driven; one definition table)
```ts
import type { Command } from 'commander';
import { resolveRuntime, type GlobalFlags } from '../config.js';
import { execute } from '../../core/execute.js';
import { toOutput } from '../../core/format.js';

type Action = { name: string; opId: string; args?: string[]; describe: string };
type Resource = { group: string; actions: Action[] };

// product-scope only; plans intentionally read-only (writes are developer-scope, out of v1).
const RESOURCES: Resource[] = [
  { group: 'subscriptions', actions: [
    { name: 'list', opId: 'subscriptions/list', describe: 'List subscriptions' },
    { name: 'get', opId: 'subscriptions/retrieve', args: ['<id>'], describe: 'Get a subscription' },
    { name: 'cancel', opId: 'subscriptions/cancel', args: ['<id>'], describe: 'Cancel a subscription (write)' },
  ]},
  { group: 'licenses', actions: [
    { name: 'list', opId: 'licenses/list', describe: 'List licenses' },
    { name: 'get', opId: 'licenses/retrieve', args: ['<id>'], describe: 'Get a license' },
    { name: 'activate', opId: 'licenses/activate', args: ['<id>'], describe: 'Activate a license (write)' },
    { name: 'deactivate', opId: 'licenses/deactivate', args: ['<id>'], describe: 'Deactivate a license (write)' },
  ]},
  { group: 'users', actions: [
    { name: 'list', opId: 'users/list', describe: 'List users' },
    { name: 'get', opId: 'users/retrieve', args: ['<id>'], describe: 'Get a user' },
  ]},
  { group: 'installs', actions: [
    { name: 'list', opId: 'installs/list', describe: 'List installs' },
  ]},
  { group: 'payments', actions: [
    { name: 'list', opId: 'payments/list', describe: 'List payments' },
    { name: 'get', opId: 'payments/retrieve', args: ['<id>'], describe: 'Get a payment' },
  ]},
  { group: 'plans', actions: [
    { name: 'list', opId: 'plans/list', describe: 'List plans' },
    { name: 'get', opId: 'plans/retrieve', args: ['<id>'], describe: 'Get a plan' },
  ]},
  { group: 'coupons', actions: [
    { name: 'list', opId: 'coupons/list', describe: 'List coupons' },
    { name: 'get', opId: 'coupons/retrieve', args: ['<id>'], describe: 'Get a coupon' },
    { name: 'create', opId: 'coupons/create', describe: 'Create a coupon (write)' },
    { name: 'delete', opId: 'coupons/delete', args: ['<id>'], describe: 'Delete a coupon (write)' },
  ]},
];

// Maps positional <id> to the operation's id-style path param name.
const ID_PARAM: Record<string, string> = {
  'subscriptions/retrieve': 'subscription_id', 'subscriptions/cancel': 'subscription_id',
  'licenses/retrieve': 'license_id', 'licenses/activate': 'license_id', 'licenses/deactivate': 'license_id',
  'users/retrieve': 'user_id', 'payments/retrieve': 'payment_id',
  'plans/retrieve': 'plan_id', 'coupons/retrieve': 'coupon_id', 'coupons/delete': 'coupon_id',
};

export function registerResourceCommands(program: Command): void {
  for (const resource of RESOURCES) {
    const group = program.command(resource.group).description(`${resource.group} operations`);
    for (const action of resource.actions) {
      const cmd = group.command(`${action.name} ${(action.args ?? []).join(' ')}`.trim());
      cmd.description(action.describe)
        .option('--json <json>', 'JSON body / extra params')
        .action(async (...callArgs: unknown[]) => {
          const id = action.args?.length ? (callArgs[0] as string) : undefined;
          const opts = callArgs[callArgs.length - 2] as { json?: string };
          const rt = resolveRuntime(program.opts<GlobalFlags>());
          const params: Record<string, unknown> = { product_id: rt.config.productId };
          if (id !== undefined) params[ID_PARAM[action.opId] ?? 'id'] = id;
          if (opts.json) Object.assign(params, JSON.parse(opts.json));
          if (rt.dryRun) { process.stdout.write(JSON.stringify({ opId: action.opId, params }, null, 2) + '\n'); return; }
          const data = await execute(rt.fs, action.opId, params, { writeMode: rt.writeMode });
          process.stdout.write(JSON.stringify(toOutput(data), null, 2) + '\n');
        });
    }
  }
}
```

- [ ] **Step 4: Run — confirm PASS.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- resources`

- [ ] **Step 5: Commit**
```bash
git add packages/mcp/src/cli/commands/resources.ts packages/mcp/__tests__/resources.test.ts
git commit -m "feat(mcp): data-driven resource commands (reads + guarded writes)"
```

### Task 9: Generic `call` command for the full catalog

**Files:**
- Modify: `packages/mcp/src/cli/commands/call.ts`
- Test: `packages/mcp/__tests__/call.test.ts`

- [ ] **Step 1: Write the failing test (param parsing helper)**

`packages/mcp/__tests__/call.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseParamFlags } from '../src/cli/commands/call';

describe('parseParamFlags', () => {
  it('parses repeated --param k=v into an object', () => {
    expect(parseParamFlags(['product_id=1', 'count=50'])).toEqual({ product_id: '1', count: '50' });
  });
  it('merges --json body', () => {
    expect(parseParamFlags(['a=1'], '{"b":2}')).toEqual({ a: '1', b: 2 });
  });
});
```

- [ ] **Step 2: Run — confirm FAIL.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- call`

- [ ] **Step 3: Implement `src/cli/commands/call.ts`**
```ts
import type { Command } from 'commander';
import { resolveRuntime, type GlobalFlags } from '../config.js';
import { execute } from '../../core/execute.js';
import { toOutput } from '../../core/format.js';

export function parseParamFlags(pairs: string[], json?: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq === -1) throw new Error(`Invalid --param "${pair}" (expected k=v)`);
    out[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  if (json) Object.assign(out, JSON.parse(json));
  return out;
}

export function registerCallCommand(program: Command): void {
  program
    .command('call <operationId>')
    .description('Call any product-scope operation by id (see `freemius call --help`)')
    .option('-p, --param <k=v>', 'parameter (repeatable)', (v: string, acc: string[]) => [...acc, v], [])
    .option('--json <json>', 'JSON body / extra params')
    .action(async (operationId: string, opts: { param: string[]; json?: string }) => {
      const rt = resolveRuntime(program.opts<GlobalFlags>());
      const params = parseParamFlags(opts.param, opts.json);
      if (params.product_id === undefined) params.product_id = rt.config.productId;
      if (rt.dryRun) { process.stdout.write(JSON.stringify({ operationId, params }, null, 2) + '\n'); return; }
      const data = await execute(rt.fs, operationId, params, { writeMode: rt.writeMode });
      process.stdout.write(JSON.stringify(toOutput(data), null, 2) + '\n');
    });
}
```

- [ ] **Step 4: Run — confirm PASS.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- call`

- [ ] **Step 5: Commit**
```bash
git add packages/mcp/src/cli/commands/call.ts packages/mcp/__tests__/call.test.ts
git commit -m "feat(mcp): generic `call` command over the full catalog"
```

---

## Phase 4 — MCP server

### Task 10: MCP server skeleton + registration helper

**Files:**
- Create: `packages/mcp/src/mcp/register.ts`
- Create: `packages/mcp/src/mcp/index.ts` (replaces any stub)
- Test: `packages/mcp/__tests__/register.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/mcp/__tests__/register.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { makeToolRegistrar } from '../src/mcp/register';

describe('makeToolRegistrar', () => {
  it('registers a tool with annotations on the server', () => {
    const server = { registerTool: vi.fn() };
    const register = makeToolRegistrar(server as never);
    register({ name: 'get_user', description: 'Get a user', readOnly: true, inputShape: {}, handler: async () => ({}) });
    expect(server.registerTool).toHaveBeenCalledWith(
      'get_user',
      expect.objectContaining({ annotations: expect.objectContaining({ readOnlyHint: true }) }),
      expect.any(Function),
    );
  });
});
```

- [ ] **Step 2: Run — confirm FAIL.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- register`

- [ ] **Step 3: Write `src/mcp/register.ts`**
```ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShape } from 'zod';

export interface ToolDef {
  name: string;
  description: string;
  readOnly: boolean;
  destructive?: boolean;
  idempotent?: boolean;
  inputShape: ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export function makeToolRegistrar(server: McpServer) {
  return function register(def: ToolDef): void {
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.inputShape,
        annotations: {
          readOnlyHint: def.readOnly,
          destructiveHint: def.destructive ?? false,
          idempotentHint: def.idempotent ?? false,
        },
      },
      async (args: Record<string, unknown>) => {
        const data = await def.handler(args);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      },
    );
  };
}
```
Note: verify the exact `registerTool` signature against the installed `@modelcontextprotocol/sdk` (`npm ls @modelcontextprotocol/sdk`, then read its `server/mcp.d.ts`). If the installed major uses `server.tool(name, schema, handler)` instead, adjust this single helper — all tools register through it.

- [ ] **Step 4: Write `src/mcp/index.ts`**
```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '../core/env.js';
import { buildFreemius } from '../core/freemius.js';
import { makeToolRegistrar } from './register.js';
import { registerCuratedTools } from './curated.js';
import { registerDynamicTools } from './dynamic.js';

export async function startServer(): Promise<void> {
  const config = loadConfig();
  const fs = buildFreemius(config);
  const server = new McpServer({ name: 'freemius', version: '0.0.0' });
  const register = makeToolRegistrar(server);
  const ctx = { fs, writeMode: config.writeMode };
  registerCuratedTools(register, ctx);
  registerDynamicTools(register, ctx);
  await server.connect(new StdioServerTransport());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
```
Note: create no-op stubs for `registerCuratedTools` and `registerDynamicTools` (and `revenue.ts`) so the build compiles before Tasks 11–12, then fill them in.

- [ ] **Step 5: Run — confirm PASS.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- register`

- [ ] **Step 6: Commit**
```bash
git add packages/mcp/src/mcp/register.ts packages/mcp/src/mcp/index.ts packages/mcp/__tests__/register.test.ts
git commit -m "feat(mcp): MCP server skeleton + annotated tool registrar"
```

### Task 11: Curated tools (data-driven) + revenue_summary

**Files:**
- Create: `packages/mcp/src/mcp/curated.ts`
- Create: `packages/mcp/src/mcp/revenue.ts`
- Test: `packages/mcp/__tests__/curated.test.ts`, `packages/mcp/__tests__/revenue.test.ts`

- [ ] **Step 1: Write the failing test for `revenue_summary` math**

`packages/mcp/__tests__/revenue.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { summarizePayments } from '../src/mcp/revenue';

describe('summarizePayments', () => {
  it('sums gross/net and counts refunds', () => {
    const s = summarizePayments([
      { gross: 100, gateway_fee: 3, is_refund: false },
      { gross: 50, gateway_fee: 2, is_refund: false },
      { gross: 20, gateway_fee: 1, is_refund: true },
    ]);
    expect(s.grossTotal).toBe(150);
    expect(s.refundCount).toBe(1);
    expect(s.netTotal).toBeCloseTo(150 - 3 - 2);
  });
});
```

- [ ] **Step 2: Run — confirm FAIL.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- revenue`

- [ ] **Step 3: Write `src/mcp/revenue.ts`** (bounded; caller passes a capped page count)
```ts
import type { Freemius } from '@freemius/sdk';

export interface PaymentLike { gross?: number; gateway_fee?: number; is_refund?: boolean }
export interface RevenueSummary {
  grossTotal: number; netTotal: number; refundCount: number; paymentCount: number;
}

export function summarizePayments(payments: PaymentLike[]): RevenueSummary {
  let grossTotal = 0, fees = 0, refundCount = 0;
  for (const p of payments) {
    grossTotal += p.gross ?? 0;
    fees += p.gateway_fee ?? 0;
    if (p.is_refund) refundCount += 1;
  }
  return { grossTotal, netTotal: grossTotal - fees, refundCount, paymentCount: payments.length };
}

const MAX_PAGES = 20; // hard cap: 20 * 50 = 1000 payments per call (review condition: bounded)

export async function revenueSummary(fs: Freemius, days = 90): Promise<RevenueSummary & { windowDays: number; capped: boolean }> {
  const payments: PaymentLike[] = [];
  let pages = 0;
  for await (const payment of fs.api.payment.iterateAll()) {
    payments.push(payment as PaymentLike);
    if (payments.length % 50 === 0) pages += 1;
    if (pages >= MAX_PAGES) break;
  }
  return { ...summarizePayments(payments), windowDays: days, capped: pages >= MAX_PAGES };
}
```
Note: confirm the `payment.iterateAll()` filter signature for date windowing (`PaymentFilterOptions`) by reading `packages/sdk/src/api/types.ts`; pass a `created` filter if available so the `days` window is real rather than nominal.

- [ ] **Step 4: Run — confirm PASS.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- revenue`

- [ ] **Step 5: Write the failing test for curated registration**

`packages/mcp/__tests__/curated.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { registerCuratedTools } from '../src/mcp/curated';

describe('registerCuratedTools', () => {
  it('registers read tools as read-only and writes as destructive-capable', () => {
    const calls: { name: string; readOnly: boolean; destructive?: boolean }[] = [];
    const register = vi.fn((def) => calls.push(def));
    registerCuratedTools(register as never, { fs: {} as never, writeMode: false });
    const names = calls.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['list_subscriptions', 'cancel_subscription', 'revenue_summary']));
    expect(calls.find((c) => c.name === 'list_subscriptions')?.readOnly).toBe(true);
    expect(calls.find((c) => c.name === 'cancel_subscription')?.destructive).toBe(true);
  });
});
```

- [ ] **Step 6: Run — confirm FAIL.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- curated`

- [ ] **Step 7: Write `src/mcp/curated.ts`** (data-driven over `execute`)
```ts
import { z } from 'zod';
import type { Freemius } from '@freemius/sdk';
import type { ToolDef } from './register.js';
import { execute } from '../core/execute.js';
import { toOutput } from '../core/format.js';
import { revenueSummary } from './revenue.js';

export interface ToolCtx { fs: Freemius; writeMode: boolean }
type Register = (def: ToolDef) => void;

interface Curated {
  name: string; opId: string; describe: string; readOnly: boolean;
  destructive?: boolean; idParam?: string;
}

const CURATED: Curated[] = [
  { name: 'list_subscriptions', opId: 'subscriptions/list', describe: 'List subscriptions', readOnly: true },
  { name: 'get_subscription', opId: 'subscriptions/retrieve', describe: 'Get a subscription', readOnly: true, idParam: 'subscription_id' },
  { name: 'cancel_subscription', opId: 'subscriptions/cancel', describe: 'Cancel a subscription', readOnly: false, destructive: true, idParam: 'subscription_id' },
  { name: 'list_licenses', opId: 'licenses/list', describe: 'List licenses', readOnly: true },
  { name: 'get_license', opId: 'licenses/retrieve', describe: 'Get a license', readOnly: true, idParam: 'license_id' },
  { name: 'activate_license', opId: 'licenses/activate', describe: 'Activate a license', readOnly: false, destructive: true, idParam: 'license_id' },
  { name: 'deactivate_license', opId: 'licenses/deactivate', describe: 'Deactivate a license', readOnly: false, destructive: true, idParam: 'license_id' },
  { name: 'get_user', opId: 'users/retrieve', describe: 'Get a user', readOnly: true, idParam: 'user_id' },
  { name: 'list_users', opId: 'users/list', describe: 'List users', readOnly: true },
  { name: 'list_installs', opId: 'installs/list', describe: 'List installs', readOnly: true },
  { name: 'list_payments', opId: 'payments/list', describe: 'List payments', readOnly: true },
  { name: 'list_plans', opId: 'plans/list', describe: 'List plans', readOnly: true },
  { name: 'get_plan', opId: 'plans/retrieve', describe: 'Get a plan', readOnly: true, idParam: 'plan_id' },
  { name: 'list_coupons', opId: 'coupons/list', describe: 'List coupons', readOnly: true },
  { name: 'create_coupon', opId: 'coupons/create', describe: 'Create a coupon', readOnly: false, destructive: false },
];

export function registerCuratedTools(register: Register, ctx: ToolCtx): void {
  for (const t of CURATED) {
    const inputShape: Record<string, z.ZodTypeAny> = t.idParam ? { [t.idParam]: z.string() } : {};
    if (!t.readOnly) inputShape.body = z.record(z.string(), z.unknown()).optional();
    register({
      name: t.name, description: t.describe, readOnly: t.readOnly,
      destructive: t.destructive ?? false, idempotent: t.readOnly,
      inputShape,
      handler: async (args) => {
        const params: Record<string, unknown> = { product_id: ctx.fs.api.product /* productId */ ? undefined : undefined, ...args };
        const data = await execute(ctx.fs, t.opId, { product_id: (ctx.fs as unknown as { api: { productId: string } }).api.productId, ...args }, { writeMode: ctx.writeMode });
        return toOutput(data);
      },
    });
  }
  register({
    name: 'revenue_summary',
    description: 'Bounded revenue summary computed from recent payments (no analytics endpoint exists; capped to ~1000 payments).',
    readOnly: true, idempotent: true,
    inputShape: { days: z.coerce.number().optional() },
    handler: async (args) => revenueSummary(ctx.fs, (args.days as number) ?? 90),
  });
}
```
Note: `product_id` comes from `ctx.fs.api.productId` (string, set in `ApiService`). Simplify the handler to: `const data = await execute(ctx.fs, t.opId, { product_id: ctx.fs.api.productId, ...args }, { writeMode: ctx.writeMode });` — remove the dead first line in `params` shown above (it is illustrative of the productId source only).

- [ ] **Step 8: Run — confirm PASS.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- curated`

- [ ] **Step 9: Commit**
```bash
git add packages/mcp/src/mcp/curated.ts packages/mcp/src/mcp/revenue.ts \
        packages/mcp/__tests__/curated.test.ts packages/mcp/__tests__/revenue.test.ts
git commit -m "feat(mcp): curated annotated tools + bounded revenue_summary"
```

### Task 12: Dynamic trio (search / describe / execute)

**Files:**
- Create: `packages/mcp/src/mcp/dynamic.ts`
- Test: `packages/mcp/__tests__/dynamic.test.ts`

- [ ] **Step 1: Write the failing test for catalog search**

`packages/mcp/__tests__/dynamic.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { searchCatalog, describeOperation } from '../src/mcp/dynamic';

describe('dynamic trio helpers', () => {
  it('search finds product-scope ops by keyword and hides developer-scope', () => {
    const hits = searchCatalog('coupon');
    expect(hits.some((h) => h.id === 'coupons/create')).toBe(true);
    expect(hits.every((h) => h.scope === 'product')).toBe(true);
  });
  it('describe returns params for an op', () => {
    const d = describeOperation('subscriptions/retrieve');
    expect(d?.params.map((p) => p.name)).toEqual(expect.arrayContaining(['product_id', 'subscription_id']));
  });
});
```

- [ ] **Step 2: Run — confirm FAIL.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- dynamic`

- [ ] **Step 3: Write `src/mcp/dynamic.ts`**
```ts
import { z } from 'zod';
import type { ToolDef } from './register.js';
import type { ToolCtx } from './curated.js';
import { OPERATIONS } from '../core/catalog.js';
import type { Operation } from '../core/catalog.types.js';
import { execute } from '../core/execute.js';
import { toOutput } from '../core/format.js';

type Register = (def: ToolDef) => void;

export function searchCatalog(query: string): Operation[] {
  const q = query.toLowerCase();
  return OPERATIONS
    .filter((o) => o.scope === 'product') // developer-scope hidden (out of v1)
    .filter((o) => o.id.toLowerCase().includes(q) || o.summary.toLowerCase().includes(q))
    .slice(0, 30);
}

export function describeOperation(opId: string): Operation | undefined {
  return OPERATIONS.find((o) => o.id === opId);
}

export function registerDynamicTools(register: Register, ctx: ToolCtx): void {
  register({
    name: 'freemius_search_tools', description: 'Search Freemius operations by keyword.',
    readOnly: true, idempotent: true,
    inputShape: { query: z.string() },
    handler: async (args) => searchCatalog(String(args.query)).map((o) => ({ id: o.id, method: o.method, summary: o.summary, destructive: o.destructive })),
  });
  register({
    name: 'freemius_describe_tool', description: 'Describe an operation: method, path, params.',
    readOnly: true, idempotent: true,
    inputShape: { operationId: z.string() },
    handler: async (args) => describeOperation(String(args.operationId)) ?? { error: 'unknown operationId' },
  });
  register({
    name: 'freemius_execute_tool',
    description: 'Execute any product-scope operation. Developer-scope and (without write mode) destructive ops are refused.',
    readOnly: false, destructive: true,
    inputShape: { operationId: z.string(), params: z.record(z.string(), z.unknown()).optional() },
    handler: async (args) => {
      const params = { product_id: (ctx.fs as unknown as { api: { productId: string } }).api.productId, ...(args.params as Record<string, unknown> ?? {}) };
      const data = await execute(ctx.fs, String(args.operationId), params, { writeMode: ctx.writeMode });
      return toOutput(data);
    },
  });
}
```

- [ ] **Step 4: Run — confirm PASS.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- dynamic`

- [ ] **Step 5: Full build + typecheck + test sweep**

Run: `npm run typecheck --workspace=@eventimio/freemius-mcp && npm run build --workspace=@eventimio/freemius-mcp && npm run test --workspace=@eventimio/freemius-mcp`
Expected: all green; `dist/cli/index.js` and `dist/mcp/index.js` emitted.

- [ ] **Step 6: Commit**
```bash
git add packages/mcp/src/mcp/dynamic.ts packages/mcp/__tests__/dynamic.test.ts
git commit -m "feat(mcp): dynamic search/describe/execute trio with guards"
```

---

## Phase 5 — Smoke, docs, release

### Task 13: End-to-end smoke against mocked Freemius (msw)

**Files:**
- Modify: `packages/mcp/package.json` (add `msw` devDep)
- Test: `packages/mcp/__tests__/e2e.test.ts`

- [ ] **Step 1: Add msw**

Run: `npm install -D msw --workspace=@eventimio/freemius-mcp`

- [ ] **Step 2: Write the e2e test (CLI read path through execute → raw client)**

`packages/mcp/__tests__/e2e.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { buildFreemius } from '../src/core/freemius';
import { execute } from '../src/core/execute';

const server = setupServer(
  http.get('https://fast-api.freemius.com/v1/products/:pid/subscriptions.json', () =>
    HttpResponse.json({ subscriptions: [{ id: '1' }, { id: '2' }] })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('e2e: subscriptions list', () => {
  it('returns subscriptions from a mocked API', async () => {
    const fs = buildFreemius({ productId: '42', apiKey: 'k', secretKey: 'x'.repeat(32), publicKey: 'y'.repeat(32), writeMode: false });
    const data = await execute(fs, 'subscriptions/list', { product_id: '42' }, { writeMode: false }) as { subscriptions: unknown[] };
    expect(data.subscriptions).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run — confirm PASS.**
Run: `npm run test --workspace=@eventimio/freemius-mcp -- e2e`
Expected: PASS. If the SDK targets a different host, update the msw URL to match `ApiService.baseUrl` (`fast-api.freemius.com/v1/`).

- [ ] **Step 4: Commit**
```bash
git add packages/mcp/package.json packages/mcp/package-lock.json packages/mcp/__tests__/e2e.test.ts
git commit -m "test(mcp): end-to-end smoke against mocked Freemius API"
```

### Task 14: README, MCP config snippets, and a changeset

**Files:**
- Create: `packages/mcp/README.md`
- Create: `.changeset/freemius-mcp-initial.md`

- [ ] **Step 1: Write `packages/mcp/README.md`**

Include: an "unofficial / not affiliated with Freemius" banner; install (`npm i -g @eventimio/freemius-mcp`); required env vars (`FREEMIUS_PRODUCT_ID`, `FREEMIUS_API_KEY`, optional `FREEMIUS_SECRET_KEY`/`FREEMIUS_PUBLIC_KEY`, `FREEMIUS_MCP_ALLOW_WRITE`); CLI examples (`freemius subscriptions list`, `freemius call coupons/list`); read-only-by-default + `--write` note; the developer-scope limitation (plan/pricing writes out of v1); and the MCP client config:
```json
{
  "mcpServers": {
    "freemius": {
      "command": "npx",
      "args": ["-y", "@eventimio/freemius-mcp"],
      "env": { "FREEMIUS_PRODUCT_ID": "12345", "FREEMIUS_API_KEY": "your_bearer_token" }
    }
  }
}
```
Also document the from-source path before publishing: `node packages/mcp/dist/mcp/index.js`.

- [ ] **Step 2: Write the changeset**

`.changeset/freemius-mcp-initial.md`:
```md
---
'@eventimio/freemius-mcp': minor
---

Add @eventimio/freemius-mcp: a `freemius` CLI and `freemius-mcp` server built on @freemius/sdk.
Product-scope operations with read-only-by-default safety, curated annotated tools, a
search/describe/execute trio over the full catalog, and a bounded revenue_summary.
```

- [ ] **Step 3: Final verification sweep (run from root)**

Run: `npm run typecheck --workspace=@eventimio/freemius-mcp && npm run test --workspace=@eventimio/freemius-mcp && npm run lint`
Expected: typecheck clean, all tests pass, lint clean (generated files ignored).

- [ ] **Step 4: Manual MCP smoke (optional, requires real keys)**

Run: `FREEMIUS_PRODUCT_ID=… FREEMIUS_API_KEY=… node packages/mcp/dist/mcp/index.js` then connect with an MCP inspector; confirm `list_subscriptions` returns data and `cancel_subscription` is refused without `FREEMIUS_MCP_ALLOW_WRITE=1`.

- [ ] **Step 5: Commit**
```bash
git add packages/mcp/README.md .changeset/freemius-mcp-initial.md
git commit -m "docs(mcp): README, MCP config snippets, and release changeset"
```

---

## Self-review checklist (completed during planning)

**Spec coverage:**
- §3 scope boundary → Task 2 (catalog `scope`) + Task 5 (`guards.assertAllowed` refuses developer scope) + Task 12 (search hides developer scope). ✓
- §5 core (execute, raw-client seam, validation, base-URL via SDK, error mapping) → Tasks 4, 5, 6. ✓
- §6 CLI (reads, guarded writes, `call`, `--write`/`--dry-run`) → Tasks 7, 8, 9. ✓
- §7 MCP (read-only default, write opt-in, destructive denylist + annotations, curated + trio, bounded revenue_summary) → Tasks 10, 11, 12. ✓
- §8 auth/config (product scope only, env vars, write flag) → Task 3. ✓
- §9 codegen (schema + catalog; runtime validation via paramsToZod) → Tasks 2, 5. ✓
- §10 isolation/test/CI (version pin in Task 1, smoke test in Task 4, vitest throughout, changeset in Task 14) → covered. ✓
- §11 distribution (`@eventimio/freemius-mcp`, npx + from-source) → Tasks 1, 14. ✓
- §12 out-of-scope (developer ops refused, no webhook server, MCP Apps future) → enforced by guards; not built. ✓

**Open verification points flagged inline for the implementer** (resolve against installed deps, not assumptions): exact `@modelcontextprotocol/sdk` `registerTool` signature (Task 10), `@freemius/sdk` constructor secret-key requirement (Task 3), `PaymentFilterOptions` date filter for the revenue window (Task 11), SDK base host for msw (Task 13). Each is isolated to one file.

**Placeholder scan:** no TBDs; every code step has complete code. The two illustrative "Note" simplifications (raw-client conditional type; curated handler productId line) explicitly state the final form to use. ✓

**Type consistency:** `Operation`/`OperationParam` (Task 2) used identically in params/guards/execute/dynamic; `ToolDef`/`ToolCtx` (Tasks 10–11) reused in curated/dynamic; `Config`/`Runtime` (Tasks 3, 7) consistent. ✓
