#!/usr/bin/env node
/**
 * Browser check for the container adaptation of the widget (specification §3.8).
 *
 * A real Chrome is the only place where container queries, overflow and focus
 * visibility can be observed, so this serves the built Angular playground and drives
 * the widget through the widths the specification names: 280, 320, 400 and 800 px.
 *
 *   pnpm --filter @nickkupriyanov/slotline-playground-angular build
 *   node tools/check-container.mjs
 *
 * Checks: no horizontal overflow inside the widget, the automatic offer count per
 * container width, the priority of an application's `--sl-slot-columns`, the
 * scrolling middle area under `--sl-max-height` with its accessible name, keyboard
 * reachability, and that the card does not change width between steps.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** An optional path on the served playground, so a specific state can be checked. */
const urlPath = process.argv[2] ?? '/';
const directory = resolve(root, 'apps/playground-angular/dist/browser');

const MIME = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function run(args) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', fail);
    child.on('close', (code) =>
      code === 0 ? done(out) : fail(new Error(`${args.join(' ')} exited with ${code}\n${err}`)),
    );
  });
}

const PROBE = `
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const style = document.createElement('style');
  document.head.append(style);

  const root = () => document.querySelector('.sl-root');
  const card = () => document.querySelector('.sl-card');
  const slots = () => document.querySelector('.sl-slots');

  const measure = () => {
    const element = root();
    const grid = slots();
    return {
      width: Math.round(card().getBoundingClientRect().width),
      columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
      overflow: element.scrollWidth - element.clientWidth,
      layout: element.getAttribute('data-sl-layout'),
      gridPanel: getComputedStyle(
        document.querySelector('.sl-adaptive-pair') ?? document.querySelector('.sl-panel'),
      ).display,
    };
  };

  const at = async (width, extra = '') => {
    style.textContent = 'sl-slotline { display: block; width: ' + width + 'px; }' + extra;
    await sleep(150);
    return measure();
  };

  // Reach the offers: the slot grid is what the column count is about.
  const day = document.querySelector('[data-day]:not([aria-disabled="true"])');
  if (!day) return { error: 'no bookable day' };
  day.click();
  await sleep(400);
  if (!slots()) return { error: 'no offers after choosing a day' };

  const widths = {};
  for (const width of [280, 320, 400, 800]) widths[width] = await at(width);

  // The application's own token beats the container's automatic count.
  const userColumns = await at(800, '.sl-root { --sl-slot-columns: 2; }');

  // The adaptive layout is the component's choice; the check switches the attribute
  // the way the component would, and the container rule does the rest.
  await at(800);
  root().setAttribute('data-sl-layout', 'adaptive');
  await sleep(150);
  const adaptiveWide = measure();
  await at(400);
  root().setAttribute('data-sl-layout', 'adaptive');
  await sleep(150);
  const adaptiveNarrow = measure();
  root().setAttribute('data-sl-layout', 'compact');
  await at(400);

  // A height limit scrolls the middle area, which must be a named region. The widget
  // declares its own token defaults, so the value goes on the widget root.
  root().style.setProperty('--sl-max-height', '420px');
  await sleep(150);
  const panel = document.querySelector('.sl-panel');
  const header = document.querySelector('.sl-header');
  const cardElement = card();
  const scrolling = {
    scrolls: panel.scrollHeight > panel.clientHeight + 1,
    role: panel.getAttribute('role'),
    label: (panel.getAttribute('aria-label') || '').trim(),
    // Measured against the card, not the viewport: the page itself may be scrolled.
    headerVisible:
      (header?.getBoundingClientRect().top ?? -1) >=
        (cardElement?.getBoundingClientRect().top ?? 0) - 1,
    diagnostics: {
      token: getComputedStyle(root()).getPropertyValue('--sl-max-height'),
      rootMax: getComputedStyle(root()).maxHeight,
      cardMax: getComputedStyle(cardElement).maxHeight,
      panelClient: panel.clientHeight,
      panelScroll: panel.scrollHeight,
    },
  };
  root().style.removeProperty('--sl-max-height');
  await sleep(80);

  // The built-in selector, with the height still limited: the popover must be
  // visible, must not live inside the scrolling panel, and must work.
  const control = document.querySelector('.sl-control-button');
  let popover = null;
  if (control) {
    const zoneBefore = document.querySelector('.sl-control-value')?.textContent?.trim() ?? '';
    control.click();
    await sleep(200);

    // Measured while it is open: picking a zone closes it, so the node is gone after.
    const element = document.querySelector('.sl-popover');
    const visible = !!element && element.getClientRects().length > 0;
    const insideScrollingPanel = !!element && !!element.closest('.sl-panel');
    const options = document.querySelectorAll('.sl-zone-option').length;

    // The search narrows the list, which is also what makes the pick deterministic.
    const search = document.querySelector('.sl-popover input');
    if (search) {
      search.value = 'berlin';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(200);
    }
    document.querySelector('.sl-zone-option')?.click();
    await sleep(500);

    popover = {
      visible,
      insideScrollingPanel,
      options,
      zoneChanged:
        zoneBefore.length > 0 &&
        zoneBefore !== (document.querySelector('.sl-control-value')?.textContent?.trim() ?? ''),
    };
  }

  // What real Tab presses visited, recorded by the harness.
  const trail = (window.__dshFocusTrail || []).filter((stop) => stop.inWidget);
  const keyboard = {
    stops: trail.length,
    hidden: trail.filter((stop) => !stop.visible).map((stop) => stop.className || stop.tag),
    focusVisible: trail.filter((stop) => stop.focusVisible).length,
    controls: document.querySelectorAll(
      '.sl-root button, .sl-root a[href], .sl-root input, .sl-root select, .sl-root textarea',
    ).length,
  };

  // The width must not move between steps: the layout was built for that.
  const onTime = measure();
  document.querySelector('button.sl-icon-button')?.click();
  await sleep(350);
  const onDate = measure();

  return {
    widths,
    userColumns,
    adaptive: { wide: adaptiveWide.gridPanel, narrow: adaptiveNarrow.gridPanel },
    scrolling,
    keyboard,
    popover,
    steps: { time: onTime.width, date: onDate.width },
  };
})()
`;

function serve(directoryPath) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    let path = join(directoryPath, decodeURIComponent(url.pathname));
    try {
      const info = await stat(path);
      if (info.isDirectory()) path = join(path, 'index.html');
      const body = await readFile(path);
      response.writeHead(200, {
        'content-type': MIME[extname(path)] ?? 'application/octet-stream',
      });
      response.end(body);
    } catch {
      try {
        const body = await readFile(join(directoryPath, 'index.html'));
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(body);
      } catch {
        response.writeHead(404).end('not found');
      }
    }
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

const server = await serve(directory);
const port = server.address().port;

let report;
try {
  const stdout = await run([
    resolve(root, 'tools/screenshot.mjs'),
    '--url',
    `http://127.0.0.1:${port}${urlPath}`,
    '--width',
    '1200',
    '--height',
    '1000',
    '--wait-for',
    '.sl-root .sl-day',
    '--tab',
    '40',
    '--eval',
    PROBE,
  ]);
  report = JSON.parse(stdout);
} finally {
  server.close();
}

if (report.error) {
  console.error(`\n✗ container check failed: ${report.error}`);
  process.exit(1);
}

const failures = [];
const expectedColumns = { 280: 1, 320: 2, 400: 3, 800: 3 };

for (const [width, measured] of Object.entries(report.widths)) {
  if (measured.overflow > 1) {
    failures.push(`the widget overflows horizontally at ${width}px (${measured.overflow}px)`);
  }
  if (measured.columns !== expectedColumns[width]) {
    failures.push(
      `at ${width}px the offers use ${measured.columns} columns, expected ${expectedColumns[width]}`,
    );
  }
}

if (report.userColumns.columns !== 2) {
  failures.push(`--sl-slot-columns: 2 was ignored (got ${report.userColumns.columns} columns)`);
}

if (report.adaptive.wide !== 'grid' || report.adaptive.narrow === 'grid') {
  failures.push(
    `the adaptive composition is wrong: 800px → ${report.adaptive.wide}, 400px → ${report.adaptive.narrow}`,
  );
}

if (report.scrolling.role !== 'region' || report.scrolling.label.length === 0) {
  failures.push('the middle area is not a named region');
}
if (!report.scrolling.scrolls) {
  failures.push('the middle area did not scroll under --sl-max-height');
}
if (!report.scrolling.headerVisible) {
  failures.push('the header scrolled out of view under --sl-max-height');
}
if (report.keyboard.hidden.length > 0) {
  failures.push(`Tab reached hidden controls: ${report.keyboard.hidden.join(', ')}`);
}
if (report.keyboard.focusVisible === 0) {
  failures.push('no control reported :focus-visible after real Tab presses');
}
if (report.popover) {
  if (!report.popover.visible) {
    failures.push('the zone popover is not visible under --sl-max-height');
  }
  if (report.popover.insideScrollingPanel) {
    failures.push('the zone popover lives inside the scrolling panel and would be clipped');
  }
  if (report.popover.options === 0) failures.push('the zone popover listed nothing');
  if (!report.popover.zoneChanged) failures.push('picking a zone in the popover changed nothing');
}
if (report.steps.time !== report.steps.date) {
  failures.push(
    `the card changed width between steps: ${report.steps.time}px → ${report.steps.date}px`,
  );
}

console.log(
  `widths:   ${Object.entries(report.widths)
    .map(([width, measured]) => `${width}px → ${measured.width}px card, ${measured.columns} col`)
    .join('  ·  ')}`,
);
console.log(
  `adaptive: panel grid at 800px ${report.adaptive.wide}, at 400px ${report.adaptive.narrow}`,
);
console.log(
  `scroll:   ${report.scrolling.scrolls ? 'scrolls' : 'fits'} · ${report.scrolling.role} "${report.scrolling.label}" · ${JSON.stringify(report.scrolling.diagnostics)}`,
);
console.log(
  `focus:    ${report.keyboard.stops} Tab stops inside the widget, ${report.keyboard.focusVisible} focus-visible`,
);
if (report.popover) {
  console.log(
    `popover:  ${report.popover.visible ? 'visible' : 'hidden'} · ${report.popover.options} zones · inside panel ${report.popover.insideScrollingPanel} · zone changed ${report.popover.zoneChanged} · ${report.popover.debug}`,
  );
}
console.log(`steps:    ${report.steps.time}px → ${report.steps.date}px`);

if (failures.length > 0) {
  console.error('\n✗ container check failed:');
  for (const failure of failures) console.error(`  · ${failure}`);
  process.exit(1);
}

console.log('\n✓ container adaptation behaves at every checked width');
