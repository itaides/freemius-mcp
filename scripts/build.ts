// build.ts — bundle the two node-compatible bins with Bun (docs/specs §4, §11).
// End users run `npx -y @eventimio/freemius-mcp`, so output targets node with a shebang banner.

import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });

const bins = [
    { name: 'cli', entry: 'src/cli/index.ts' },
    { name: 'mcp', entry: 'src/mcp/index.ts' },
] as const;

for (const bin of bins) {
    const result = await Bun.build({
        entrypoints: [bin.entry],
        outdir: `dist/${bin.name}`,
        target: 'node',
        banner: '#!/usr/bin/env node',
        minify: false,
    });
    if (!result.success) {
        for (const log of result.logs) console.error(log);
        process.exit(1);
    }
    console.log(`Built dist/${bin.name}/index.js`);
}
