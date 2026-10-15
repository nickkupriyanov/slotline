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
  const { snapshot, actions } = useSlotlineContext();
  const view = snapshot.view;

  useEffect(() => {
    if (target === 'date') return;
    if (view.step !== 'date' || view.month.status !== 'ready') return;
    const day = view.month.grid.find((candidate) => view.days[candidate]?.bookable);
    if (day) actions.selectDate(day);
  }, [target, view.step, view.month.status, view.month.grid, view.days, actions]);

  useEffect(() => {
    if (target === 'date' || target === 'time') return;
    if (view.step !== 'time' || view.slots.status !== 'ready') return;
    const slot = view.slots.items[0];
    if (slot) actions.selectSlot(slot);
  }, [target, view.step, view.slots.status, view.slots.items, actions]);

  useEffect(() => {
    if (target !== 'confirmed') return;
    if (view.step !== 'details') return;
    if (!view.form.values.name || !view.form.values.email) {
      actions.setValues({ name: 'Ann Example', email: 'ann@example.com' });
      return;
    }
    if (view.actions.canSubmit) void actions.submit();
  }, [target, view.step, view.form.values, view.actions.canSubmit, actions]);

  return null;
}

/**
 * The cases the gallery shows, each marked on the element it renders:
 * `data-sl-case`, `data-sl-step` and `data-sl-layout`. A check reads those instead
 * of counting figures, so adding a case never needs a check update.
 */
const STATES: Array<{ target: Target; caption: string; step: string; layout: string }> = [
  { target: 'date', caption: '1 · calendar', step: 'date', layout: 'compact' },
  { target: 'time', caption: '2 · slots', step: 'time', layout: 'compact' },
  { target: 'details', caption: '3 · details', step: 'details', layout: 'compact' },
  { target: 'confirmed', caption: '4 · booked', step: 'confirmed', layout: 'compact' },
  { target: 'time', caption: '5 · slots, adaptive', step: 'time', layout: 'adaptive' },
];

function Gallery() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('theme');
    if (requested === 'light' || requested === 'dark') setTheme(requested);
  }, []);

  return (
    <div className="gallery" data-theme={theme}>
      {STATES.map(({ target, caption, step, layout }) => (
        <figure
          className="gallery__item"
          key={`${step}-${layout}`}
          data-sl-case={target}
          data-sl-step={step}
          data-sl-layout={layout}
        >
          <figcaption>{caption}</figcaption>
          <SlotlineProvider
            adapter={createMockAdapter({ horizonDays: 90, latency: 0 })}
            theme={theme}
            locale="en"
            layout={layout === 'adaptive' ? 'adaptive' : 'compact'}
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
