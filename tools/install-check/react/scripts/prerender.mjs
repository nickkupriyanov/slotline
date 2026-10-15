/**
 * Puts the widget's server-rendered markup into the built page.
 *
 * This is what makes the browser check a hydration check: `tools/check-hydration.mjs`
 * refuses to run unless the served `index.html` already contains the widget, and the
 * page then hydrates exactly this markup.
 *
 * Run after `vite build`.
 */
import { readFile, writeFile } from 'node:fs/promises';

const { createMockAdapter } = await import('@nickkupriyanov/slotline-core');
const { Slotline } = await import('@nickkupriyanov/slotline-react');
const { renderToString } = await import('react-dom/server');
const { createElement } = await import('react');

const adapter = createMockAdapter({ horizonDays: 30 });
const html = renderToString(createElement(Slotline, { adapter }));

const file = new URL('../dist/index.html', import.meta.url);
const page = await readFile(file, 'utf8');
if (!page.includes('<div id="root"></div>')) {
  throw new Error('the built page has no empty #root to fill');
}

await writeFile(
  file,
  page.replace('<div id="root"></div>', `<div id="root">${html}</div>`),
  'utf8',
);
console.log(`✓ prerendered ${html.length} characters of widget markup into dist/index.html`);
