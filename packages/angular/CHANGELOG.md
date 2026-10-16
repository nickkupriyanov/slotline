# @nickkupriyanov/slotline-angular

## 0.3.0

### Minor Changes

- 83bdcd9: Replaceable parts and a configurable form.

  - Twelve extension points — `Header`, `Progress`, `DayContent`, `Slot`, `Form`,
    `Summary`, `Attempt`, `Confirmation`, `DurationFooter`, `Loading`, `Error`, `Empty` —
    in both bindings. React takes a `components` map, Angular a template marked with
    `slSlotlinePart`; the contexts are equivalent.
  - A part receives only its data and the actions it triggers. A slot gets prepared
    button props; a day gets its content swapped inside the library's own button, so
    focus and keyboard navigation survive; the duration footer calls the controller's
    action instead of holding state.
  - The defaults are exported, so a part can be wrapped rather than re-implemented, and
    `classNames` keeps working independently.
  - The form is configurable without replacing anything: `fields`, `values`,
    `defaultValues`, `onValuesChange` and `validateValues`, with server errors bound to
    their fields and unknown ones kept in the general area.
  - The playgrounds show one widget booking different services and two resources on one
    calendar, with a custom offer card.

### Patch Changes

- Updated dependencies [83bdcd9]
  - @nickkupriyanov/slotline-core@0.4.0

## 0.2.0

### Minor Changes

- 02116fd: Let the application own the choice.

  - `mode: 'selection'` stops the flow at the offer: no form, no confirmation, and an
    adapter that only has to answer availability — a selection never writes a
    `createBooking` it would not call.
  - Controlled `selection` with `onSelectionChange`: the widget reports what the user
    proposed, the application decides what to apply, and there is no event loop.
  - `formMode: 'skip'` keeps the recap and a confirmation while the application owns
    the values.
  - `@nickkupriyanov/slotline-angular/forms` joins the package: a
    `ControlValueAccessor` that uses the widget as a field of an existing reactive form,
    handling the value, `touched` and `disabled`. A form owns the value from the
    widget's first state, through an injection token, so `@angular/forms` stays an
    optional peer of the primary entry point.
  - Both playgrounds show a checkout that treats the widget as one of its fields.

### Patch Changes

- Updated dependencies [02116fd]
  - @nickkupriyanov/slotline-core@0.3.0

## 0.1.0

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

### Patch Changes

- Updated dependencies [9ea599b]
  - @nickkupriyanov/slotline-core@0.2.0
