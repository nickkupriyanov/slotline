import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  SlotlineProvider,
  SlotlineView,
  createMockAdapter,
  useSlotlineContext,
} from '@nickkupriyanov/slotline-react';
import '@nickkupriyanov/slotline-react/styles.css';
import './app.css';
import './gallery.css';

type Target = 'date' | 'time' | 'details' | 'confirmed';

/**
 * Drives the real widget to a given step through the public actions, so the
 * gallery always shows genuine component output — not a mock-up.
 */
function AutoDrive({ target }: { target: Target }) {
  const { state, actions, monthGrid, isDayBookable } = useSlotlineContext();

  useEffect(() => {
    if (target === 'date') return;
    if (state.step !== 'date' || state.daysStatus !== 'ready') return;
    const day = monthGrid.find((candidate) => isDayBookable(candidate));
    if (day) actions.selectDate(day);
  }, [target, state.step, state.daysStatus, monthGrid, isDayBookable, actions]);

  useEffect(() => {
    if (target === 'date' || target === 'time') return;
    if (state.step !== 'time' || state.slotsStatus !== 'ready') return;
    const slot = state.slots[0];
    if (slot) actions.selectSlot(slot);
  }, [target, state.step, state.slotsStatus, state.slots, actions]);

  useEffect(() => {
    if (target !== 'confirmed') return;
    if (state.step !== 'details') return;
    if (!state.details.name || !state.details.email) {
      actions.setDetails({ name: 'Ann Example', email: 'ann@example.com' });
      return;
    }
    if (state.submitStatus === 'idle') void actions.submit();
  }, [target, state.step, state.details, state.submitStatus, actions]);

  return null;
}

const STATES: Array<{ target: Target; caption: string }> = [
  { target: 'date', caption: '1 · calendar' },
  { target: 'time', caption: '2 · slots' },
  { target: 'details', caption: '3 · details' },
  { target: 'confirmed', caption: '4 · booked' },
];

function Gallery() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('theme');
    if (requested === 'light' || requested === 'dark') setTheme(requested);
  }, []);

  return (
    <div className="gallery" data-theme={theme}>
      {STATES.map(({ target, caption }) => (
        <figure className="gallery__item" key={target}>
          <figcaption>{caption}</figcaption>
          <SlotlineProvider
            adapter={createMockAdapter({ horizonDays: 90, latency: 0 })}
            theme={theme}
            locale="en"
          >
            <SlotlineView />
            <AutoDrive target={target} />
          </SlotlineProvider>
        </figure>
      ))}
    </div>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
