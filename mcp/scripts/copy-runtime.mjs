import { copyFile } from 'node:fs/promises';
// TypeScript resolves the adjacent .d.mts declaration; copy its JS runtime explicitly.
await copyFile(new URL('../../studio/src/timeline-layout.mjs', import.meta.url), new URL('../dist/studio/src/timeline-layout.mjs', import.meta.url));
