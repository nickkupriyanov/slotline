import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  createMockAdapter,
  type AvailabilityAdapter,
  type BookingSelection,
} from '@nickkupriyanov/slotline-core';
import { SlotlineComponent } from '@nickkupriyanov/slotline-angular';
import { SlotlineControlDirective } from '@nickkupriyanov/slotline-angular/forms';

/**
 * The widget as a field of a reactive form.
 *
 * The directive is the only bridge: the form owns the value, the touched state and
 * the disabled state, and no contact form or confirmation appears — the checkout
 * around it decides what happens to the picked slot.
 */
@Component({
  selector: 'app-form-example',
  imports: [ReactiveFormsModule, SlotlineComponent, SlotlineControlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="checkout">
      <h2>Inside a reactive form</h2>
      <p class="checkout__hint">
        Slotline is one control of this form. The button belongs to the form; the widget only
        reports the slot it picked.
      </p>

      <form [formGroup]="form" (ngSubmit)="request()">
        <label class="checkout__field">
          What is it about?
          <input formControlName="reason" placeholder="Intro call" />
        </label>

        <sl-slotline
          mode="selection"
          formControlName="slot"
          [adapter]="adapter"
          locale="en"
          timeZone="UTC"
        />

        <div class="checkout__actions">
          <button type="submit" [disabled]="!chosen()">Request this slot</button>
          <span class="checkout__choice">{{ chosenLabel() }}</span>
        </div>
      </form>

      @if (requested(); as requested) {
        <p class="checkout__result" role="status">Requested {{ requested }}</p>
      }
    </section>
  `,
})
export class FormExample {
  /** Availability only: a selection never creates anything. */
  readonly adapter: AvailabilityAdapter = (() => {
    const mock = createMockAdapter({ horizonDays: 60, timeZone: 'UTC', busyRatio: 0.25 });
    return {
      getAvailability: (query) => mock.getAvailability(query),
      getSlots: (query) => mock.getSlots(query),
    };
  })();

  readonly form = new FormGroup({
    reason: new FormControl('', { nonNullable: true }),
    slot: new FormControl<BookingSelection>(null),
  });

  readonly requested = signal<string | null>(null);

  /**
   * The control's value as a signal. A `FormControl` is not reactive by itself, so
   * the template follows its changes through `valueChanges` instead of reading a
   * value that Angular would never know had changed.
   */
  readonly slot = toSignal(this.form.controls.slot.valueChanges, {
    initialValue: this.form.controls.slot.value,
  });

  readonly chosen = computed(() => this.slot()?.slot ?? null);
  readonly chosenLabel = computed(() => {
    const value = this.slot();
    return value?.slot ? `${value.date} · ${value.slot.start}` : 'No slot picked yet';
  });

  protected request(): void {
    const value = this.slot();
    if (!value?.slot) return;
    const reason = this.form.controls.reason.value;
    this.requested.set(`${value.date} · ${value.slot.start}${reason ? ` — “${reason}”` : ''}`);
  }
}
