# @nickkupriyanov/slotline-core

The framework-free half of **Slotline** — a booking widget that walks the user
through _month calendar → time slots → details → confirmation_.

This package owns everything that has nothing to do with a UI framework:

- **The flow state machine** — `createFlowState`, `flowReducer`, `FLOW_STEPS`,
  `stepIndex`, `validateDetails`, `countSlots`. A pure reducer over an explicit
  action union, so every transition is synchronous and testable.
- **Dates and time zones** — `Intl`-based, DST-safe helpers: `dayKeyOf`,
  `monthKeyOf`, `addDays`, `buildMonthGrid`, `formatTime`, `formatFullDay`… see
  the module for the full list.
- **Copy** — `defaultMessages`, `format`, `resolveMessages`, `detectLocale`
  (`en` and `ru` shipped, any locale tag works for `Intl` formatting).
- **Stable class names** — `SLOT_CLASS` and the `cx` helper, so a binding can
  render the markup the shipped stylesheet expects.
- **The adapter contract** — `BookingAdapter`, `BookingRequest`,
  `BookingResult`, `TimeSlot`, `DayAvailability` and the rest of the domain
  types. Bring your own backend; there is no vendor lock-in.
- **A mock adapter** — `createMockAdapter`, useful in demos and tests.

It also owns the stylesheet, so every binding renders the same look:

```ts
import '@nickkupriyanov/slotline-core/styles.css';
```

## Bindings

`@nickkupriyanov/slotline-react` is the React binding. An Angular binding will
drive this same core: the reducer is already free of I/O, so a binding only has
to render the flow and call the adapter.

## License

MIT
