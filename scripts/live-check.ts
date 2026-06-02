// live-check.ts — manual end-to-end sanity check against the REAL Freemius API.
// Reads .env (Bun auto-loads it), builds the client, and does one safe read.
//   Run:  bun run scripts/live-check.ts
// Never logs secrets — only non-sensitive product fields.

import { createFreemius } from '../src/core/freemius.js';

const { client, canSign } = createFreemius();

const product = await client.api.product.retrieve();

if (!product) {
    console.error('❌ product.retrieve() returned null — auth failed, wrong product id, or non-2xx.');
    process.exit(1);
}

console.log('✅ Live read OK — auth → client → Freemius API works.');
console.log('   product id:', product.id);
console.log('   title:    ', (product as { title?: string }).title ?? '(no title field)');
console.log('   canSign:  ', canSign, canSign ? '(secret+public present)' : '(api-key only)');
