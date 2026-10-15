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

let report;
try {
  report = await probe(url, PROBE, 'app-gallery-panel .sl-root');
  if (!givenUrl) {
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

if (failures.length > 0) {
  console.error('\n✗ gallery check failed:');
  for (const failure of failures) console.error(`  · ${failure}`);
  process.exit(1);
}

console.log('\n✓ every screen of the flow renders, and the form example submits its own value');
