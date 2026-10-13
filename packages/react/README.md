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
- **Small**: ~15 kB gzip ESM (this package plus the core it depends on) + ~4.5 kB gzip CSS, no third-party runtime dependencies.

## Entries

| Import | What you get |
| --- | --- |
| `@nickkupriyanov/slotline-react` | `Slotline`, `SlotlineProvider`, `SlotlineView`, `useBookingFlow`, `useSlotlineContext`, `createMockAdapter`, types, date and i18n helpers. |
| `@nickkupriyanov/slotline-react/motion` | The same API with a spring-based animation kit. Requires the optional `motion` peer dependency. |
| `@nickkupriyanov/slotline-react/styles.css` | The stylesheet. Import it once. |

The state machine, the `Intl` date helpers, the copy, the class names and the stylesheet come from **`@nickkupriyanov/slotline-core`**, a dependency of this package. React users never import it directly — it exists so another binding can render the same widget against the same core.

## Adapter

```ts
import type { BookingAdapter } from '@nickkupriyanov/slotline-react';

export const adapter: BookingAdapter = {
  async getAvailability({ from, to, duration, timeZone, signal }) {
    const res = await fetch(`/api/availability?from=${from}&to=${to}&duration=${duration}&tz=${timeZone}`, { signal });
    if (!res.ok) throw new Error('Could not load availability');
    return res.json(); // [{ date: '2026-05-04', slotCount: 8 }, …]
  },
  async getSlots({ date, duration, timeZone, signal }) {
    const res = await fetch(`/api/slots?date=${date}&duration=${duration}&tz=${timeZone}`, { signal });
    if (!res.ok) throw new Error('Could not load times');
    return res.json(); // [{ start: '2026-05-04T07:15:00Z' }, …]
  },
  async createBooking(request) {
    const res = await fetch('/api/bookings', { method: 'POST', body: JSON.stringify(request) });
    if (!res.ok) throw new Error('Booking failed');
    return res.json(); // { id, inviteeEmail? }
  },
};
```

`request` is `{ slot, date, duration, timeZone, details }`. Every query receives an `AbortSignal` tied to the widget's lifetime.

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

## Custom UI

```tsx
import { SlotlineProvider, useSlotlineContext } from '@nickkupriyanov/slotline-react';

const Panel = () => {
  const { state, monthLabel, actions, isDayBookable, monthGrid } = useSlotlineContext();
  return (
    <>
      <h2>{monthLabel}</h2>
      {monthGrid.filter(isDayBookable).map((day) => (
        <button key={day} onClick={() => actions.selectDate(day)}>{day}</button>
      ))}
    </>
  );
};

export const Custom = () => (
  <SlotlineProvider adapter={adapter} theme="dark"><Panel /></SlotlineProvider>
);
```

## Documentation

Full prop tables, the class-name reference, the animation matrix, accessibility notes and the scope/limits section live in the
[repository README](https://github.com/nickkupriyanov/slotline#readme).

## License

MIT © Nick Kupriyanov
