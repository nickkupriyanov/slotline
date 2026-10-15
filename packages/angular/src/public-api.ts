/**
 * @nickkupriyanov/slotline-angular — the Angular binding of Slotline.
 *
 * The flow itself lives in `@nickkupriyanov/slotline-core`: one controller, one
 * derived view model, two renderings. This package adds a headless service that
 * exposes the controller as signals, and a standalone component that renders the
 * same view model the React binding renders.
 */

export { SlotlineService } from './lib/slotline.service';
export { SLOTLINE_FORM_STATE, type SlotlineFormState } from './lib/form-bridge';
export { SlotlinePartDirective } from './lib/parts';
export type { SlotlinePartContexts, SlotlinePartName } from './lib/parts';
export { SlotlineComponent } from './lib/slotline.component';
export type {
  BookedEvent,
  ContextChangeEvent,
  DurationChangeEvent,
  FailedEvent,
  SelectionChangeEvent,
  SlotlineComponentInputs,
  TimeFormatChangeEvent,
  TimeZoneChangeEvent,
} from './lib/types';

/* The flow and its contract are re-exported so an Angular application needs one
   import for both the widget and the types it works with. */
export {
  BookingError,
  createBookingController,
  createIdempotencyKey,
  DEFAULT_BOOKING_CONTEXT,
  contextKeyOf,
  deriveBookingView,
  isBookingError,
  resolveBookingConfig,
  resolveMessages,
  toBookingError,
} from '@nickkupriyanov/slotline-core';
export type {
  AvailabilityAdapter,
  BookingAdapter,
  BookingChangeMetadata,
  BookingContext,
  BookingController,
  BookingControllerActions,
  BookingControllerInputs,
  BookingErrorContext,
  BookingFieldConfig,
  BookingRequest,
  BookingResult,
  BookingSelection,
  BookingSnapshot,
  BookingState,
  BookingView,
  SelectionChangeReason,
  SlotlineMessages,
  SlotlineTheme,
  TimeFormat,
  TimeSlot,
} from '@nickkupriyanov/slotline-core';
