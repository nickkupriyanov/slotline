#!/usr/bin/env node
/**
 * Screenshot helper for docs and visual checks.
 *
 * Drives a locally installed Chrome over the DevTools Protocol — no extra
 * dependencies, no `--virtual-time-budget` (which deadlocks on the widget's
 * looping skeleton animation).
 *
 *   node tools/screenshot.mjs \
 *     --url http://localhost:4173/gallery.html \
 *     --out .screenshots/gallery-dark.png \
 *     --width 1900 --height 1060 --wait-for ".sl-day-dot[data-visible]"
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index]?.replace(/^--/, ''), process.argv[index + 1]);
}

const url = args.get('url');
const out = args.get('out');
const evaluate = args.get('eval');
if (!url || (!out && !evaluate)) {
  console.error(
    'usage: node tools/screenshot.mjs --url <url> [--out <file>] [--eval <expression>] [--width] [--height] [--wait] [--wait-for <selector>] [--scale]',
  );
  process.exit(1);
}

const width = Number(args.get('width') ?? 1400);
const height = Number(args.get('height') ?? 900);
const scale = Number(args.get('scale') ?? 2);
const settleMs = Number(args.get('wait') ?? 600);
const waitFor = args.get('wait-for');
const port = Number(args.get('port') ?? 9333);

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await import('node:fs/promises').then((fs) => fs.access(candidate));
      return candidate;
    } catch {
      /* keep looking */
    }
  }
  throw new Error('No Chrome/Chromium binary found');
}

class Cdp {
  #socket;
  #id = 0;
  #pending = new Map();

  static async attach(webSocketDebuggerUrl) {
    const cdp = new Cdp();
    cdp.#socket = new WebSocket(webSocketDebuggerUrl);
    await new Promise((done, fail) => {
      cdp.#socket.addEventListener('open', done, { once: true });
      cdp.#socket.addEventListener('error', fail, { once: true });
    });
    cdp.#socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const pending = cdp.#pending.get(message.id);
      if (!pending) return;
      cdp.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
    return cdp;
  }

  send(method, params = {}) {
    this.#id += 1;
    const id = this.#id;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.#socket.close();
  }
}

async function waitForHttp(endpoint, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) return await response.json();
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${endpoint}`);
}

const chrome = await findChrome();
const chromeProcess = spawn(
  chrome,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--force-color-profile=srgb',
    `--user-data-dir=${resolve(root, '.chrome-profile')}`,
    `--remote-debugging-port=${port}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let cdp;
try {
  await waitForHttp(`http://127.0.0.1:${port}/json/version`);
  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
    method: 'PUT',
  }).then((response) => response.json());
  cdp = await Cdp.attach(target.webSocketDebuggerUrl);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: scale,
    mobile: false,
  });
  await cdp.send('Page.navigate', { url });
  await sleep(settleMs);

  if (waitFor) {
    const deadline = Date.now() + 15000;
    for (;;) {
      const { result } = await cdp.send('Runtime.evaluate', {
        expression: `Boolean(document.querySelector(${JSON.stringify(waitFor)}))`,
        returnByValue: true,
      });
      if (result.value) break;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${waitFor}`);
      await sleep(150);
    }
    // Let the entry animations finish before capturing.
    await sleep(700);
  }

  if (evaluate) {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
      expression: evaluate,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.text ?? 'evaluation failed');
    console.log(JSON.stringify(result.value, null, 2));
  }

  if (out) {
    const capture = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });

    const target_ = resolve(root, out);
    await mkdir(dirname(target_), { recursive: true });
    await writeFile(target_, Buffer.from(capture.data, 'base64'));
    console.log(`[screenshot] ${out} (${width}×${height} @${scale}x)`);
  }
} finally {
  cdp?.close();
  chromeProcess.kill('SIGKILL');
}
