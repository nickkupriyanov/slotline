# @nickkupriyanov/slotline-core

## 0.2.0

### Minor Changes

- 9ea599b: The new API line: one controller, three renderers.

  ### `@nickkupriyanov/slotline-core`
  - The controller owns every request, the reducer is pure, and the view is a cached
    derivation of state plus a time anchor, so React renders it through
    `useSyncExternalStore` and Angular through signals.
  - Time is explicit: a shared anchor, a configurable clock, midnight boundaries and a
    half-open safe-retry window. The controller asks for nothing at creation, which is
    what keeps server rendering deterministic.
  - `BookingError` and its codes, `resolveAttempt`, the idempotency key on every
    request, `capabilities` and the attempt screen: the rules that make a repeat safe
    exist from the first release rather than being added later.
  - `TimeSlot.id` and `BookingResult.id` are separate identities, and a missing
    capability is never treated as a promise.
  - Fixed controlled/uncontrolled mode, with diagnostics instead of silent switching.

  ### `@nickkupriyanov/slotline-react` · `@nickkupriyanov/slotline-angular`
  - React is translated onto the controller and keeps `{ snapshot, actions }`.
  - `@nickkupriyanov/slotline-angular` is new: a zoneless-ready component and a
    headless service over the same controller, packed from the `dist` ng-packagr writes.
  - `@nickkupriyanov/slotline-core/dom` holds the framework-free DOM utilities; the main
    entry never touches `window`.
