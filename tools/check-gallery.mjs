#!/usr/bin/env node
/**
 * Browser check for the Angular playground: its state gallery and its "widget as a
 * field of someone else's form" example.
 *
 * The gallery drives five real widgets to five different screens through the
 * controller's own actions, so it is the one place where "the binding renders every
 * state" is visible outside jsdom — and where the driver a consumer would write for
 * a guided tour is exercised end to end. The second pass drives the reactive-form
 * example, which is where the `/forms` control value accessor meets a real form in a
 * real browser.
 *
 * It serves the built playground itself, so no preview server is needed:
 *
 *   pnpm --filter @nickkupriyanov/slotline-playground-angular build
 *   node tools/check-gallery.mjs
 *
 * Requires a local Chrome (see `tools/screenshot.mjs`) and a real layout engine.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index]?.replace(/^--/, ''), process.argv[index + 1]);
}

const directory = resolve(root, args.get('dir') ?? 'apps/playground-angular/dist/browser');
const givenUrl = args.get('url');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Serves the built playground, with a fallback to `index.html`. */
async function serve(directory) {
  const server = createServer(async (request, response) => {
    const path = join(
      directory,
      decodeURIComponent(new URL(request.url, 'http://localhost').pathname),
    );
    let file = path;
    try {
      const info = await stat(file);
      if (info.isDirectory()) file = join(file, 'index.html');
    } catch {
      file = join(directory, 'index.html');
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('not found');
    }
  });

  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { server, port: server.address().port };
}

const EXPECTED = ['date', 'time', 'details', 'attempt', 'confirmed'];

/** Drives the reactive-form example: the form owns the value, the button, the rest. */
const FORM_PROBE = `
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const deadline = Date.now() + 20000;
  const section = document.querySelector('.checkout');
  if (!section) return { error: 'the form example is not rendered' };

  const cells = () => [...section.querySelectorAll('[role="gridcell"]')];
  while (Date.now() < deadline && cells().length === 0) await sleep(100);

  const day = cells().find((cell) => cell.getAttribute('aria-disabled') !== 'true');
  day?.click();
  while (Date.now() < deadline && section.querySelectorAll('.sl-slot').length === 0) await sleep(100);

  const offer = section.querySelector('.sl-slot');
  offer?.click();
  await sleep(150);

  const button = section.querySelector('button[type="submit"]');
  while (Date.now() < deadline && button?.disabled) await sleep(100);
  button?.click();
  await sleep(200);

  const root = section.querySelector('.sl-root');
  return {
    offers: section.querySelectorAll('.sl-slot').length,
    selected: section.querySelectorAll('.sl-slot.is-selected').length,
    buttonEnabled: button?.disabled === false,
    choice: section.querySelector('.checkout__choice')?.textContent?.trim() ?? '',
    requested: section.querySelector('.checkout__result')?.textContent?.trim() ?? '',
    step: root?.getAttribute('data-sl-step') ?? null,
    hasBookingForm: section.querySelector('.sl-submit') !== null,
  };
})()
`;

const PROBE = `
(async () => {
  const panels = [...document.querySelectorAll('app-gallery-panel')];
  if (panels.length !== ${EXPECTED.length}) {
    return { error: 'expected ${EXPECTED.length} gallery panels, got ' + panels.length };
  }

  const report = () => panels.map((panel) => {
    const root = panel.querySelector('.sl-root');
    const card = panel.querySelector('.sl-card');
    const width = (element) => (element ? Math.round(element.getBoundingClientRect().width * 100) / 100 : 0);
    return {
      step: root?.getAttribute('data-sl-step') ?? null,
      label: panel.querySelector('figcaption')?.textContent?.trim() ?? '',
      card: width(card),
      root: width(root),
      overflowX: card ? card.scrollWidth > Math.ceil(width(card)) : true,
    };
  });

  const deadline = Date.now() + ${Number(args.get('timeout') ?? 15000)};
  while (Date.now() < deadline) {
    const steps = report().map((entry) => entry.step);
    if (steps.join() === ${JSON.stringify(EXPECTED)}.join()) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return { panels: report(), expected: ${JSON.stringify(EXPECTED)} };
})()
`;

const { server, port } = givenUrl ? { server: null, port: null } : await serve(directory);
const url = givenUrl ?? `http://127.0.0.1:${port}/?view=gallery`;

const run = (argv) =>
  new Promise((done, fail) => {
    const child = spawn(process.execPath, argv, {
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

/** Runs one probe against a URL and returns what it reported. */
async function probe(url, expression, waitFor) {
  const stdout = await run([
    resolve(root, 'tools/screenshot.mjs'),
    '--url',
    url,
    '--width',
    '1600',
    '--height',
    '1100',
    '--wait-for',
    waitFor,
    '--eval',
    expression,
  ]);
  return JSON.parse(stdout);
}

let report;
let form;
try {
  report = await probe(url, PROBE, 'app-gallery-panel .sl-root');
  if (!givenUrl) {
    form = await probe(`http://127.0.0.1:${port}/`, FORM_PROBE, '.checkout .sl-root');
  }
} finally {
  server?.close();
}

if (report.error) {
  console.error(`✗ ${report.error}`);
  process.exit(1);
}

const failures = [];
const steps = report.panels.map((panel) => panel.step);
for (const [index, expected] of EXPECTED.entries()) {
  if (steps[index] !== expected) {
    failures.push(
      `${report.panels[index]?.label || `panel ${index}`}: ${steps[index]} ≠ ${expected}`,
    );
  }
}
for (const panel of report.panels) {
  if (panel.card !== panel.root) {
    failures.push(`${panel.label}: card ${panel.card}px ≠ root ${panel.root}px`);
  }
  if (panel.overflowX) failures.push(`${panel.label} overflows horizontally`);
}

console.log(`screens:  ${report.panels.map((panel) => panel.step).join('  ·  ')}`);

if (form) {
  if (form.error) {
    failures.push(form.error);
  } else {
    if (form.offers === 0) failures.push('the form example listed no offers');
    if (!form.buttonEnabled) failures.push('the form button never became enabled');
    if (!form.requested) failures.push('submitting the form reported nothing');
    if (form.hasBookingForm) failures.push('the form example rendered a booking form');
    if (form.step !== 'time') failures.push(`the form example left the offers: ${form.step}`);
    console.log(`checkout: ${form.selected} selected  ·  ${form.choice}  ·  ${form.requested}`);
  }
}

if (failures.length > 0) {
  console.error('\n✗ gallery check failed:');
  for (const failure of failures) console.error(`  · ${failure}`);
  process.exit(1);
}

console.log('\n✓ every screen of the flow renders, and the form example submits its own value');
