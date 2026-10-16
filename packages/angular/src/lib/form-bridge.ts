import { InjectionToken, type Signal } from '@angular/core';
import type { BookingSelection } from '@nickkupriyanov/slotline-core';

/**
 * What a form control tells the widget about itself.
 *
 * The `/forms` entry point provides this from a directive on the widget's own
 * element. It exists because a directive cannot write its host's inputs: the widget
 * has to learn that a form owns its value *before* it creates the controller, and
 * the controller fixes its controlled/uncontrolled mode at creation.
 *
 * The token lives in the primary entry point — and only refers to Angular core — so
 * the primary never depends on `@angular/forms`.
 */
export interface SlotlineFormState {
  /** The value the form holds. */
  readonly value: Signal<BookingSelection>;
  /** Whether the form disabled the control. */
  readonly disabled: Signal<boolean>;
  /**
   * Called with the selection the user proposed.
   *
   * A controlled flow reports proposals instead of applying them, so this is how
   * the form learns what to write back — one round trip, and the widget follows.
   * The directive calls `onChange` and marks the control touched from here.
   */
  onProposal?(selection: BookingSelection): void;
}

export const SLOTLINE_FORM_STATE = new InjectionToken<SlotlineFormState>('slotline.formState');
