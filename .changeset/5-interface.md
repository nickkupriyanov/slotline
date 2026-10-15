---
'@nickkupriyanov/slotline-core': minor
'@nickkupriyanov/slotline-react': minor
'@nickkupriyanov/slotline-angular': minor
---

The interface adapts to its container.

- Adaptation moved from viewport media queries to container queries on a named
  container — the widget root. New tokens: `--sl-width-adaptive` and `--sl-max-height`.
- `layout` (`compact` or `adaptive`) is the component's own choice and the root reports
  it as `data-sl-layout`. In `adaptive`, the time step shows the calendar beside the
  offers once the container is 720px wide — one grid, two columns, no re-composition
  while the step is read.
- The automatic offer count follows the container (one column to 300px, two to 380px,
  three above), and an application's `--sl-slot-columns` resolves in front of it.
- With `--sl-max-height` set, the middle area scrolls while the header and the footer
  stay put, and the area is a `region` named after the current step.
- Optional, off-by-default controls: a time zone selector with search and a 12/24
  switch. Switching the format makes no request; a zone change re-reads the day, because
  the same instant may belong to another date in the new zone.
- `tools/dev-server` is a dependency-free teaching server with idempotent creation and a
  lost answer, shared by both playgrounds, plus four browser checks in real Chrome.
