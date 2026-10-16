# @nickkupriyanov/slotline-angular

The Angular binding of **Slotline** — a themable, accessible booking widget that
walks the user through _month calendar → time slots → details → confirmation_.

The flow itself lives in **`@nickkupriyanov/slotline-core`**: one controller, one
derived view model, two renderings. This package adds:

- **`SlotlineComponent`** — the ready-made standalone widget (`<sl-slotline>`).
- **`SlotlineService`** — the headless binding: one controller per instance,
  exposed as signals (`view()`, `state()`, `snapshot()`, `messages()`, `actions`).
- **`@nickkupriyanov/slotline-angular/forms`** — a `ControlValueAccessor` directive
  that uses the widget as a field of an existing reactive form:

```ts
import { SlotlineControlDirective } from '@nickkupriyanov/slotline-angular/forms';

@Component({
  imports: [ReactiveFormsModule, SlotlineControlDirective],
  template: `<form [formGroup]="form">
    <sl-slotline mode="selection" formControlName="slot" [adapter]="adapter" />
  </form>`,
})
export class BookingFormComponent {
  readonly adapter: AvailabilityAdapter = availability;
  readonly form = new FormGroup({ slot: new FormControl<BookingSelection>(null) });
}
```

`@angular/forms` stays an optional peer: only that entry point imports it.

```ts
import { Component } from '@angular/core';
import { SlotlineComponent, type BookingAdapter } from '@nickkupriyanov/slotline-angular';
import '@nickkupriyanov/slotline-angular/styles.css';

@Component({
  selector: 'app-booking',
  imports: [SlotlineComponent],
  template: `<sl-slotline [adapter]="adapter" locale="ru" (booked)="onBooked($event)" />`,
})
export class BookingComponent {
  readonly adapter: BookingAdapter = myAdapter;
  onBooked(event: { result: { id: string } }) {
    console.log('booked', event.result.id);
  }
}
```

The package builds with `ng-packagr` 21.2.7 in partial compilation mode, and its
peer ranges cover Angular 21 and 22 (`^21.0.0 || ^22.0.0`). `@angular/forms` is not
required; the `ControlValueAccessor` for using the widget inside an existing form
arrives with the `/forms` entry point.

Unit tests run on Angular's own `TestBed` with Vitest 4. Angular's compiler emits
the specs first (`ngc -p tsconfig.aot-spec.json`, wired into `pnpm test`): the
widget's signal inputs and its template need a real compilation, and the CLI's
unit-test builder cannot compile a library project's specs in 21.2 — it builds its
TypeScript program from an application's entry points, and a library has none.

The package is `private` until the first stable release: it is published together
with the 1.0 version line, when the bindings have reached parity. Until then it is
verified from its packed tarball — installed into a clean application and built in
three configurations: zoneless, zone.js, and SSR with prerendering and hydration.

## License

MIT © Nick Kupriyanov

## Replacing parts

```html
<sl-slotline [adapter]="adapter">
  <ng-template slSlotlinePart="slot" let-slot let-slotProps="slotProps">
    <button type="button" [class]="slotProps.className" (click)="slotProps.onClick()">
      {{ slot.label }} <span class="price">€90</span>
    </button>
  </ng-template>
</sl-slotline>
```

Wired parts: `slot`, `dayContent`, `form`, `attempt`, `confirmation`,
`durationFooter`, `header`, `progress`, `summary`, `loading`, `error`, `empty`. The
context is the equivalent of the React part props.

## Time zone and format controls

```html
<sl-slotline
  [adapter]="adapter"
  [showTimeZoneSelector]="true"
  [showTimeFormatSelector]="true"
  [timeZones]="['UTC', 'Europe/Berlin']"
/>
```

Both are off by default, and both report through `(timeZoneChange)` and
`(timeFormatChange)`. Without `timeZones` the list comes from the runtime, always
including UTC and the current zone.
