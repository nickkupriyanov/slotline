#!/usr/bin/env node
/**
 * Layout guard for the widget's width.
 *
 * jsdom has no layout engine, so the "the card resizes between steps" class of
 * bug is invisible to the unit tests. This check drives a real Chrome over the
 * DevTools Protocol and asserts the invariant that broke once:
 *
 *   · every step renders at exactly `--sl-width`
 *   · a narrower parent shrinks the widget, never the content
 *   · nothing overflows horizontally
 *
 * A served gallery is required:
 *   pnpm --filter @nickkupriyanov/slotline-playground build
 *   pnpm --filter @nickkupriyanov/slotline-playground preview      # http://localhost:4173
 *   node tools/check-layout.mjs
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv[2] ?? 'http://localhost:4173/gallery.html';

const PROBE = `
(async () => {
  const width = (element) => Math.round(element.getBoundingClientRect().width * 100) / 100;
  // The gallery marks its cases; the check reads them instead of counting figures, so
  // a new case never means editing the check and no number of steps is assumed.
  const items = [...document.querySelectorAll('[data-sl-case]')];
  if (items.length === 0) return { error: 'no marked gallery cases' };

  const measured = items.map((item) => {
    const card = item.querySelector('.sl-card');
    return {
      step: item.getAttribute('data-sl-step'),
      layout: item.getAttribute('data-sl-layout') || 'compact',
      width: width(card),
      expected: width(item.querySelector('.sl-root')),
      overflowX: card.scrollWidth > Math.ceil(width(card)),
    };
  });

  // A layout has one width; different layouts are allowed to differ, which is the
  // whole point of the adaptive layout.
  const compact = measured.find((entry) => entry.layout === 'compact') || measured[0];
  const first = items[0];
  const previous = first.style.width;
  first.style.width = '320px';
  const narrow = width(first.querySelector('.sl-card'));
  first.style.width = '1000px';
  const wide = width(first.querySelector('.sl-card'));
  first.style.width = previous;

  return { measured, narrowParent: narrow, wideParent: wide };
})()
`;

const run = (args) =>
  new Promise((done, fail) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.on('error', fail);
    child.on('close', (code) =>
      code === 0 ? done(stdout) : fail(new Error(`probe exited ${code}`)),
    );
  });

const stdout = await run([
  resolve(root, 'tools/screenshot.mjs'),
  '--url',
  url,
  '--width',
  '1980',
  '--height',
  '800',
  '--wait-for',
  '.sl-confirmation-title',
  '--eval',
  PROBE,
]);

const report = JSON.parse(stdout);
if (report.error) {
  console.error(`✗ ${report.error}`);
  process.exit(1);
}

const failures = [];

// Widths are grouped by layout: every case of one layout renders at one width, and
// a different layout may choose another.
const byLayout = new Map();
for (const entry of report.measured) {
  const list = byLayout.get(entry.layout) ?? [];
  list.push(entry);
  byLayout.set(entry.layout, list);
}
for (const [layout, entries] of byLayout) {
  const widths = [...new Set(entries.map((entry) => entry.width))];
  if (widths.length !== 1) {
    failures.push(
      `${layout} cases render at different widths: ${entries
        .map((entry) => `${entry.step} ${entry.width}px`)
        .join(', ')}`,
    );
  }
}
for (const entry of report.measured) {
  if (entry.overflowX) failures.push(`${entry.step} overflows horizontally`);
  if (entry.width !== entry.expected) {
    failures.push(`${entry.step}: card ${entry.width}px ≠ root ${entry.expected}px`);
  }
}
if (report.narrowParent !== 320) {
  failures.push(`320px parent → ${report.narrowParent}px widget`);
}
if (report.wideParent !== report.measured[0].expected) {
  failures.push(
    `1000px parent → ${report.wideParent}px widget (expected ${report.measured[0].expected}px)`,
  );
}

console.log(
  `cases:    ${report.measured.map((e) => `${e.step}/${e.layout} ${e.width}px`).join('  ·  ')}`,
);
console.log(`parents:  320px → ${report.narrowParent}px   1000px → ${report.wideParent}px`);

if (failures.length > 0) {
  console.error('\n✗ layout check failed:');
  for (const failure of failures) console.error(`  · ${failure}`);
  process.exit(1);
}

console.log('\n✓ every step renders at the same width, no overflow');
