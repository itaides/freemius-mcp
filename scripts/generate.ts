// generate.ts — regenerate src/core/{schema.d.ts, catalog.ts, validators.ts} from openapi.yaml
// (docs/specs §9). Three committed artifacts so installs need no codegen.
//
//   schema.d.ts  — openapi-typescript (compile-time types)
//   catalog.ts   — 140-op catalog + hand-curated safe/destructive overlay; FAIL the build if any
//                  operation id is missing from the overlay (fail-closed, §7)
//   validators.ts— runtime zod v4 (or ajv) per operation; must round-trip a sample payload
//
// TODO: implement. Keep this deterministic and snapshot-tested.

console.error('generate.ts: not implemented yet — see docs/specs §9');
process.exit(1);
