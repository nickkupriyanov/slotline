---
'@nickkupriyanov/slotline-core': minor
'@nickkupriyanov/slotline-react': minor
'@nickkupriyanov/slotline-angular': minor
---

Let the application own the choice.

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
