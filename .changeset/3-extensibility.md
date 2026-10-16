---
'@nickkupriyanov/slotline-core': minor
'@nickkupriyanov/slotline-react': minor
'@nickkupriyanov/slotline-angular': minor
---

Replaceable parts and a configurable form.

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
