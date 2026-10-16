import { Directive, TemplateRef, inject, input } from '@angular/core';
import type {
  BookingAttemptView,
  BookingProgressView,
  BookingView,
  BookingConfirmationView,
  BookingDayView,
  BookingDurationView,
  BookingFormView,
  BookingSlotView,
  SlotlineMessages,
} from '@nickkupriyanov/slotline-core';

/**
 * The parts of the widget an application can replace.
 *
 * Each one is declared as a template with the `slSlotlinePart` directive:
 *
 * ```html
 * <sl-slotline [adapter]="adapter">
 *   <ng-template slSlotlinePart="slot" let-slot let-slotProps="slotProps">
 *     <button [attr.class]="slotProps.className" (click)="slotProps.onClick()">
 *       {{ slot.label }} — €90
 *     </button>
 *   </ng-template>
 * </sl-slotline>
 * ```
 *
 * The context is the equivalent of the React part props: `$implicit` is the data,
 * and the named bindings (`let-slotProps="slotProps"`) carry the prepared actions
 * and attributes.
 */
export type SlotlinePartName =
  | 'header'
  | 'progress'
  | 'slot'
  | 'dayContent'
  | 'form'
  | 'summary'
  | 'attempt'
  | 'confirmation'
  | 'durationFooter'
  | 'loading'
  | 'error'
  | 'empty';

/** Everything a replaced part may need, keyed by part. */
export interface SlotlinePartContexts {
  /**
   * The header's own content — the back affordance, the title and the duration.
   * The progress bar stays where the library put it, right after this block, so a
   * replaced header keeps its place in the layout.
   */
  header: {
    $implicit: {
      title: string;
      durationLabel: string;
      back: { label: string; disabled: boolean } | null;
    };
  };
  progress: { $implicit: BookingProgressView };
  dayContent: { $implicit: { day: string; dayView?: BookingDayView } };
  slot: {
    $implicit: BookingSlotView;
    index: number;
    /** Spread these: handler, selection state, accessible name, animation hook. */
    slotProps: {
      type: 'button';
      className: string;
      style: Record<string, unknown>;
      'aria-current'?: 'true';
      'aria-label'?: string;
      disabled: boolean;
      onClick(): void;
    };
  };
  form: {
    $implicit: BookingFormView;
    messages: SlotlineMessages;
    actions: {
      setValues(values: Record<string, unknown>): void;
      touchField(field: string): void;
      submit(): void;
      retry(): void;
    };
  };
  attempt: {
    $implicit: BookingAttemptView;
    actions: { retry(): void; checkStatus?: (() => void) | undefined };
  };
  confirmation: {
    $implicit: BookingConfirmationView;
    actions: { reset(): void };
  };
  summary: { $implicit: BookingView };
  loading: { $implicit: { count: number } };
  error: {
    $implicit: { message: string; retryLabel: string };
    retry?: (() => void) | undefined;
  };
  empty: {
    $implicit: { title: string; body: string };
    action?: { label: string; onClick(): void } | undefined;
  };
  durationFooter: {
    $implicit: BookingDurationView;
    /** The controller's own action. */
    select(minutes: number): void;
  };
}

/**
 * Marks an `ng-template` as the replacement for one part.
 *
 * A template that is never rendered by the library is still a content child, so it
 * costs nothing until the part it replaces is on screen.
 */
@Directive({
  selector: 'ng-template[slSlotlinePart]',
  standalone: true,
})
export class SlotlinePartDirective {
  /** Which part this template replaces. */
  readonly part = input.required<SlotlinePartName>({ alias: 'slSlotlinePart' });
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}
