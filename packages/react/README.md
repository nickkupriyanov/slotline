# @nickkupriyanov/slotline-react

[![npm](https://img.shields.io/npm/v/@nickkupriyanov/slotline-react?label=npm)](https://www.npmjs.com/package/@nickkupriyanov/slotline-react)
[![CI](https://github.com/nickkupriyanov/slotline/actions/workflows/ci.yml/badge.svg)](https://github.com/nickkupriyanov/slotline/actions/workflows/ci.yml)
[![Live demo](https://img.shields.io/badge/demo-live-ff215a)](https://nickkupriyanov.github.io/slotline/)
[![Storybook](https://img.shields.io/badge/storybook-open-ff4785)](https://nickkupriyanov.github.io/slotline/storybook/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://github.com/nickkupriyanov/slotline/blob/main/LICENSE)

A booking widget for React: **month calendar → time slots → details → confirmation** in one drop-in component.

**[Live demo](https://nickkupriyanov.github.io/slotline/)** · **[Storybook](https://nickkupriyanov.github.io/slotline/storybook/)**

Dark theme by default, plain-CSS theming, soft animations, `Intl`-correct time zones, and one small adapter that connects it to your backend.

```bash
pnpm add @nickkupriyanov/slotline-react
```

```tsx
import { Slotline, createMockAdapter } from '@nickkupriyanov/slotline-react';
import '@nickkupriyanov/slotline-react/styles.css';

export const Booking = () => <Slotline adapter={createMockAdapter()} theme="dark" />;
```

## Highlights

- **No vendor, no iframe.** You implement `getAvailability`, `getSlots` and `createBooking`; the widget never talks to anyone else.
- **Dark and light themes by design**, built on CSS custom properties (`--sl-accent`, `--sl-surface`, …) — retheme it from your own stylesheet.
- **Soft animations with zero runtime**: direction-aware step transitions, animated height, staggered slot reveals, a self-drawing check mark. Optional `@nickkupriyanov/slotline-react/motion` entry for spring transitions.
- **Accessible**: ARIA grid with roving tabindex, keyboard navigation, live-region step announcements, focus management, labelled controls, `prefers-reduced-motion` support.
- **Correct dates**: day keys are time-zone aware, slots are instants, everything formats through `Intl`. `en` and `ru` copy included, any locale tag works.
- **Small**: ~29 kB gzip ESM (this package plus the core it depends on) + ~4.5 kB gzip CSS, no third-party runtime dependencies.

## Entries

| Import                                      | What you get                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `@nickkupriyanov/slotline-react`            | `Slotline`, `SlotlineProvider`, `SlotlineView`, `useBookingFlow`, `useSlotlineContext`, `createMockAdapter`, types, date and i18n helpers. |
| `@nickkupriyanov/slotline-react/motion`     | The same API with a spring-based animation kit. Requires the optional `motion` peer dependency.                                            |
| `@nickkupriyanov/slotline-react/styles.css` | The stylesheet. Import it once.                                                                                                            |

The controller, the derived view model, the reducer, the `Intl` date helpers, the copy, the class names and the stylesheet come from **`@nickkupriyanov/slotline-core`**, a dependency of this package. React users rarely import it directly — it exists so another binding renders the same flow against the same core.

## Adapter

```ts
import type { BookingAdapter } from '@nickkupriyanov/slotline-react';

export const adapter: BookingAdapter = {
  async getAvailability({ from, to, duration, timeZone, context, signal }) {
    const res = await fetch(
      `/api/availability?from=${from}&to=${to}&duration=${duration}&tz=${timeZone}&schedule=${context.key}`,
      { signal },
    );
    if (!res.ok) throw new Error('Could not load availability');
    return res.json(); // [{ date: '2026-05-04', slotCount: 8 }, …]
  },
  async getSlots({ date, duration, timeZone, signal }) {
    const res = await fetch(`/api/slots?date=${date}&duration=${duration}&tz=${timeZone}`, {
      signal,
    });
    if (!res.ok) throw new Error('Could not load times');
    return res.json(); // [{ id: '2026-05-04#0915', start: '2026-05-04T07:15:00Z' }, …]
  },
  async createBooking({ slot, values, idempotencyKey }) {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
      body: JSON.stringify({ slotId: slot.id, values }),
    });
    if (!res.ok) throw new Error('Booking failed');
    return res.json(); // { id, status: 'confirmed', invitation? }
  },
  // Optional: a repeat of an unknown outcome stays safe for this long.
  capabilities: { idempotentCreate: true, idempotencyRetentionMs: 86_400_000 },
};
```

`request` is `{ slot, date, duration, timeZone, context, values, idempotencyKey }`: every offer has a stable `id`, and `values` is the typed form payload. Every query receives an `AbortSignal` tied to the widget's lifetime.

## Theming

```css
.sl-root {
  --sl-accent: #7c5cff;
  --sl-accent-hover: #8f74ff;
  --sl-accent-ink: #ab9dff;
  --sl-accent-soft: rgba(124, 92, 255, 0.18);
  --sl-radius-card: 18px;
  --sl-width: 440px;
}
```

Set `theme="light" | "dark" | "system"` on the component; the resolved theme lands on `.sl-root[data-sl-theme]`.

## Time zone and format controls

Both are optional and off by default, for applications that already own such a
control:

```tsx
<Slotline
  adapter={adapter}
  showTimeZoneSelector
  showTimeFormatSelector
  timeZones={['UTC', 'Europe/Berlin']}
/>
```

Without `timeZones` the list comes from the runtime, always including UTC and the
current zone. `onTimeZoneChange` and `onTimeFormatChange` report what was picked; the
format switch makes no request, and a zone change re-reads the day because the same
instant may belong to another date in the new zone.

## Container adaptation

The widget adapts to its container, not to the viewport. `layout="adaptive"` widens
the card to `--sl-width-adaptive` and from 720 px of container width composes the
panel in two columns:

```tsx
<Slotline adapter={adapter} layout="adaptive" />
```

Tokens (declare them on the widget element or a wrapper that targets `.sl-root` —
the widget declares its own defaults):

| Token                 | Default   | Meaning                                             |
| --------------------- | --------- | --------------------------------------------------- |
| `--sl-width`          | `400px`   | width in the `compact` layout                       |
| `--sl-width-adaptive` | `800px`   | width in the `adaptive` layout                      |
| `--sl-max-height`     | `none`    | when set, the middle area scrolls                   |
| `--sl-slot-columns`   | automatic | offers per row; wins over the container's own count |

The automatic count follows the container: up to 300 px one column, up to 380 px two,
above three.

## Replacing parts

`components` swaps one part of the standard widget without re-implementing the rest:

```tsx
<Slotline
  adapter={adapter}
  components={{
    Slot: ({ slot, slotProps, children }) => (
      <button {...slotProps}>
        {children} <span className="price">{slot.data?.price as string}</span>
      </button>
    ),
  }}
/>
```

Every part receives its own data and the actions it triggers; the defaults are
exported (`DefaultSlot`, `DefaultForm`, …) so a part can be wrapped instead of
rewritten. `classNames` keeps working independently, and a replaced `Form` uses the
same values, errors and submission as the built-in one.

The form itself is configurable without replacing anything:

```tsx
<Slotline
  adapter={adapter}
  fields={[
    { name: 'phone', label: 'Phone', type: 'tel', required: true },
    {
      name: 'topic',
      label: 'What is it about?',
      type: 'select',
      required: true,
      options: [{ value: 'intro', label: 'Intro call' }],
    },
  ]}
  defaultValues={{ phone: '+49 30 1234567' }}
/>
```

## Custom UI

```tsx
import { SlotlineProvider, useSlotlineContext } from '@nickkupriyanov/slotline-react';

const Panel = () => {
  const { snapshot, actions } = useSlotlineContext();
  const view = snapshot.view;
  return (
    <>
      <h2>{view.month.label}</h2>
      {view.month.grid
        .filter((day) => view.days[day]?.bookable)
        .map((day) => (
          <button key={day} onClick={() => actions.selectDate(day)}>
            {day}
          </button>
        ))}
    </>
  );
};

export const Custom = () => (
  <SlotlineProvider adapter={adapter} theme="dark">
    <Panel />
  </SlotlineProvider>
);
```

## Documentation

Full prop tables, the class-name reference, the animation matrix, accessibility notes and the scope/limits section live in the
[repository README](https://github.com/nickkupriyanov/slotline#readme).

## License

MIT © Nick Kupriyanov
