// fetch-spec.ts — pull the Freemius OpenAPI spec the pinned @freemius/sdk is generated from
// (docs/specs §9). Run, then `bun run generate`, then review the diff + bump the SDK pin together.

const SPEC_URL = 'https://freemius.com/help/documentation/api/openapi.yaml';

const res = await fetch(SPEC_URL);
if (!res.ok) {
    throw new Error(`fetch-spec: ${SPEC_URL} returned ${res.status}`);
}
await Bun.write('openapi.yaml', await res.text());
console.log(`Wrote openapi.yaml from ${SPEC_URL}`);
