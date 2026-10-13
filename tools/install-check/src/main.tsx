/**
 * A throwaway consumer app used by `tools/verify-install.mjs`.
 *
 * It imports the *packed* library through its public entry points only
 * (`.`, `/motion`, `/styles.css`, plus the core package) so a broken `exports`
 * map, a missing type declaration or a missing stylesheet fails the check.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { cx } from '@nickkupriyanov/slotline-core';
import {
  Slotline,
  SlotlineProvider,
  SlotlineView,
  createMockAdapter,
  useSlotlineContext,
  type BookingRequest,
  type BookingResult,
} from '@nickkupriyanov/slotline-react';
import { Slotline as MotionSlotline } from '@nickkupriyanov/slotline-react/motion';
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

/** Confirms the headless API is exported. */
function HeadlessProbe() {
  const { state } = useSlotlineContext();
  return <p data-headless-step={state.step}>headless step: {state.step}</p>;
}

function App() {
  const [log, setLog] = useState<string[]>([]);
  const adapter = createMockAdapter({ horizonDays: 30 });

  return (
    <StrictMode>
      <StyleProbe />
      <Slotline
        adapter={adapter}
        theme="dark"
        locale="ru"
        timeZone="Europe/Berlin"
        onBooked={(result: BookingResult, request: BookingRequest) =>
          setLog((entries) => [...entries, `${result.id}@${request.date}`])
        }
      />
      <MotionSlotline adapter={adapter} theme="light" />
      <SlotlineProvider adapter={adapter}>
        <SlotlineView />
        <HeadlessProbe />
      </SlotlineProvider>
      <pre data-bookings>{log.join('\n')}</pre>
    </StrictMode>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('missing #root');
createRoot(container).render(<App />);
