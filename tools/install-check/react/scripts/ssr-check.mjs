/**
 * Server rendering and client hydration of the packed React binding.
 *
 * The application is a real consumer: it imports the tarball-installed packages,
 * renders the widget in Node (where there is no DOM at all) and then hydrates that
 * exact markup in jsdom, failing on any React mismatch report. That covers the two
 * conditions the specification states for server rendering — no DOM access while
 * importing, and no markup mismatch — without needing a browser.
 */
import { JSDOM } from 'jsdom';
import { createElement } from 'react';

const PROPS = { locale: 'en', timeZone: 'UTC' };
const MOCK = { latency: 0, horizonDays: 30, timeZone: 'UTC', busyRatio: 0 };

const { createMockAdapter } = await import('@nickkupriyanov/slotline-core');
const { Slotline } = await import('@nickkupriyanov/slotline-react');

const adapter = createMockAdapter(MOCK);
const element = createElement(Slotline, { adapter, ...PROPS });

/* 1. The server: plain Node, no `window`, no `document`. */
const { renderToString } = await import('react-dom/server');
const html = renderToString(element);

if (!html.includes('sl-root') || !html.includes('data-sl-step="date"')) {
  throw new Error(`the server render produced no widget: ${html.slice(0, 240)}`);
}

/* 2. The client: hydrate that markup and listen for mismatch reports. */
const dom = new JSDOM(`<!doctype html><html><body><div id="root">${html}</div></body></html>`, {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});

// Node defines a few of these as getter-only globals, so they are replaced with
// `defineProperty`; the ones that need their `this` get it bound.
const BOUND = new Set(['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']);
for (const name of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'KeyboardEvent',
  'CustomEvent',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]) {
  const value = dom.window[name];
  if (value === undefined) continue;
  Object.defineProperty(globalThis, name, {
    value: BOUND.has(name) ? value.bind(dom.window) : value,
    configurable: true,
    writable: true,
  });
}
globalThis.window.matchMedia ??= (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
});
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const problems = [];
const originalError = console.error;
console.error = (...args) => problems.push(args.map((value) => String(value)).join(' '));

try {
  const { hydrateRoot } = await import('react-dom/client');
  const root = hydrateRoot(dom.window.document.getElementById('root'), element);
  // Let the layout effects and the first availability answer land.
  await new Promise((resolve) => setTimeout(resolve, 150));
  root.unmount();
} finally {
  console.error = originalError;
}

const mismatches = problems.filter((line) =>
  /hydrat|did not match|mismatch|server rendered|server html/i.test(line),
);
if (mismatches.length > 0) {
  throw new Error(`hydration reported mismatches:\n${mismatches.join('\n')}`);
}

console.log('✓ server render and client hydration agree');
