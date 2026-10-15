/**
 * A throwaway consumer app used by `tools/verify-install.mjs`.
 *
 * It imports the *packed* library through its public entry points only (`.`,
 * `/styles.css`, plus the core package and its `/dom` subpath) so a broken
 * `exports` map, a missing type declaration or a missing stylesheet fails the
 * check. Motion is deliberately absent: it is an optional peer, so the base entry
 * has to build without it.
 *
 * `#root` is hydrated: `scripts/prerender.mjs` puts the server's markup there after
 * the build, and the browser then checks that hydration attaches to it without a
 * complaint. The probes render into `#extra`, which the server never renders.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { cx } from '@nickkupriyanov/slotline-core';
import { observeMediaQuery, trapFocus } from '@nickkupriyanov/slotline-core/dom';
import {
  Slotline,
  SlotlineProvider,
  SlotlineView,
  createMockAdapter,
  useSlotlineContext,
  type BookingRequest,
  type BookingResult,
} from '@nickkupriyanov/slotline-react';
import '@nickkupriyanov/slotline-react/styles.css';

/** Confirms the shipped stylesheet actually reaches the browser. */
function StyleProbe() {
  const [state, setState] = useState('pending');

  useEffect(() => {
    const probe = document.createElement('div');
    probe.className = cx('sl-root', 'probe');
    document.body.appendChild(probe);
    const accent = getComputedStyle(probe).getPropertyValue('--sl-accent').trim();
    const radius = getComputedStyle(probe).getPropertyValue('--sl-radius-card').trim();
    probe.remove();
    setState(accent && radius ? 'ok' : 'missing');
  }, []);

  return <p data-styles={state}>stylesheet: {state}</p>;
}

/** Confirms the DOM entry point is exported and reachable. */
function DomProbe() {
  const [reduced, setReduced] = useState('unknown');

  useEffect(() => {
    const stop = observeMediaQuery('(prefers-reduced-motion: reduce)', (matches) =>
      setReduced(matches ? 'reduce' : 'no-preference'),
    );
    return stop;
  }, []);

  return <p data-dom={typeof trapFocus === 'function' ? 'ok' : 'missing'}>dom: {reduced}</p>;
}

/** Confirms the headless API is exported. */
function HeadlessProbe() {
  const { snapshot } = useSlotlineContext();
  return <p data-headless-step={snapshot.view.step}>headless step: {snapshot.view.step}</p>;
}

/** Client-only probes: entry points, the stylesheet, the DOM helpers, headless use. */
function Probes({ adapter }: { adapter: ReturnType<typeof createMockAdapter> }) {
  const [log, setLog] = useState<string[]>([]);

  return (
    <StrictMode>
      <StyleProbe />
      <DomProbe />
      <Slotline
        adapter={adapter}
        onBooked={(result: BookingResult, request: BookingRequest) =>
          setLog((entries) => [...entries, `${result.id}@${request.date}`])
        }
      />
      <SlotlineProvider adapter={adapter}>
        <SlotlineView />
        <HeadlessProbe />
      </SlotlineProvider>
      <pre data-bookings>{log.join('\n')}</pre>
    </StrictMode>
  );
}

/**
 * Everything the page reports through `console` is kept where a browser check can
 * read it back: hydration mismatches are logged while React boots, which is before
 * any probe could install a listener.
 */
const problems: string[] = [];
for (const level of ['error', 'warn'] as const) {
  const original = console[level];
  console[level] = (...values: unknown[]) => {
    problems.push(`${level}: ${values.map((value) => String(value)).join(' ')}`);
    original(...values);
  };
}
(window as unknown as { __problems: string[] }).__problems = problems;

const adapter = createMockAdapter({ horizonDays: 30 });
const root = document.getElementById('root');
const extra = document.getElementById('extra');
if (!root || !extra) throw new Error('missing #root or #extra');

// The very same element the prerender script rendered on the server.
hydrateRoot(root, <Slotline adapter={adapter} />);
createRoot(extra).render(<Probes adapter={adapter} />);
