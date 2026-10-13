/**
 * Post-build steps:
 *  1. copy the core stylesheet into `dist/slotline.css`, so
 *     `@nickkupriyanov/slotline-react/styles.css` keeps working now that the
 *     core owns the authored CSS
 *  2. make sure both entry points start with the `"use client"` directive so
 *     React Server Components can import them from a client boundary.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/* -------------------------------------------------------------------------- */
/*  1. CSS                                                                    */
/* -------------------------------------------------------------------------- */

let coreStylesheet;
try {
  coreStylesheet = require.resolve('@nickkupriyanov/slotline-core/styles.css');
} catch {
  throw new Error(
    '[slotline-react] cannot find @nickkupriyanov/slotline-core/styles.css — ' +
      'build @nickkupriyanov/slotline-core first (pnpm build).',
  );
}

const dist = resolve(root, 'dist');
await mkdir(dist, { recursive: true });
await writeFile(resolve(dist, 'slotline.css'), await readFile(coreStylesheet, 'utf8'), 'utf8');
console.log(`[slotline-react] css → dist/slotline.css (copied from @nickkupriyanov/slotline-core)`);

/* -------------------------------------------------------------------------- */
/*  2. "use client"                                                           */
/* -------------------------------------------------------------------------- */

const BUNDLES = ['index.js', 'index.cjs', 'motion.js', 'motion.cjs'];
const DIRECTIVE = `"use client";\n`;

for (const file of BUNDLES) {
  const path = resolve(dist, file);
  const source = await readFile(path, 'utf8');
  if (source.startsWith('"use client"') || source.startsWith("'use client'")) continue;
  await writeFile(path, DIRECTIVE + source, 'utf8');
}
console.log(`[slotline-react] "use client" → ${BUNDLES.join(', ')}`);
