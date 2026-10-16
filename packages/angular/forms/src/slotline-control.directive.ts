import { Directive, forwardRef, signal } from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import {
  SLOTLINE_FORM_STATE,
  type BookingSelection,
  type SlotlineFormState,
} from '@nickkupriyanov/slotline-angular';

/** Structural comparison: a form compares values, not object identities. */
function sameSelection(left: BookingSelection, right: BookingSelection): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.date === right.date && (left.slot?.id ?? null) === (right.slot?.id ?? null);
}

/**
 * Uses Slotline as a field of an existing form.
 *
 * ```html
 * <form [formGroup]="form">
 *   <sl-slotline mode="selection" formControlName="slot" [adapter]="adapter" />
 * </form>
 * ```
 *
 * The widget reports what the user picked and applies nothing until the form writes
 * the value back, which is what makes it behave like any other control: the form
 * owns the value, the touched state and the disabled state.
 */
@Directive({
  selector: 'sl-slotline[slotlineControl], sl-slotline[formControlName], sl-slotline[formControl]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SlotlineControlDirective),
      multi: true,
    },
    {
      provide: SLOTLINE_FORM_STATE,
      useExisting: forwardRef(() => SlotlineControlDirective),
    },
  ],
})
export class SlotlineControlDirective implements ControlValueAccessor, SlotlineFormState {
  /**
   * What the widget reads before it creates its controller. The widget is on the
   * same element, so it sees this provider and knows from its first state that the
   * form owns the value.
   */
  readonly value = signal<BookingSelection>(null);
  readonly disabled = signal(false);

  /** What the widget proposes: the form takes it, and writes it back as its value. */
  readonly onProposal = (selection: BookingSelection): void => {
    this.value.set(selection);
    this.onChange(selection);
    this.onTouched();
  };

  private onChange: (value: BookingSelection) => void = () => {};
  private onTouched: () => void = () => {};

  /** The form's value: the widget shows it once the owner accepts it. */
  writeValue(value: BookingSelection | null): void {
    this.value.set(value ?? null);
  }

  registerOnChange(fn: (value: BookingSelection) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
