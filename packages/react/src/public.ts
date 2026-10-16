/**
 * The public surface shared by `@nickkupriyanov/slotline-react` and `@nickkupriyanov/slotline-react/motion`.
 * Each entry point adds its own `Slotline` component bound to an animation kit.
 *
 * Framework-free modules are re-exported straight from
 * `@nickkupriyanov/slotline-core`: the controller, the derived view model, the
 * reducer and the domain contract all live there, so a second binding renders the
 * same behaviour.
 */

export { SlotlineProvider, createSlotline } from './Slotline';
export { SlotlineView } from './components/SlotlineView';
export { useBookingFlow } from './useBookingFlow';
export { useAnimations, useSlotlineContext, useClassNames, useUI } from './context';
export type { SlotlineUIContextValue, UseBookingFlowResult } from './context';
export { cssAnimations } from './animations/css';

/* -- Replaceable parts ------------------------------------------------------ */

export {
  DEFAULT_COMPONENTS,
  DefaultAttempt,
  DefaultConfirmation,
  DefaultDayContent,
  DefaultDurationFooter,
  DefaultEmpty,
  DefaultError,
  DefaultForm,
  DefaultHeader,
  DefaultLoading,
  DefaultProgress,
  DefaultSlot,
  DefaultSummary,
} from './parts';

export type {
  AttemptPartProps,
  BackAffordance,
  ConfirmationPartProps,
  DayContentPartProps,
  DurationFooterPartProps,
  EmptyPartProps,
  ErrorPartProps,
  FormPartProps,
  HeaderPartProps,
  LoadingPartProps,
  PartComponent,
  ProgressPartProps,
  SlotPartProps,
  SlotlineComponents,
  SummaryPartProps,
} from './parts';

/* -- Flow, controller and derivation ---------------------------------------- */

export {
  bookingReducer,
  countSlots,
  createBookingController,
  createBookingState,
  createEmptyValues,
  deriveBookingView,
  resolveBookingConfig,
  resolveBookingFields,
  unmappedFieldNames,
  userSteps,
  validateBookingValues,
  visibleFieldErrors,
} from '@nickkupriyanov/slotline-core';

export type {
  BookingAction,
  BookingAttemptState,
  BookingController,
  BookingControllerActions,
  BookingControllerHandlers,
  BookingControllerInputs,
  BookingControllerOptions,
  BookingConfig,
  BookingConfigInput,
  BookingConfigOverrides,
  BookingErrorContext,
  BookingFieldConfig,
  BookingFieldOption,
  BookingFieldType,
  BookingSnapshot,
  BookingAttemptView,
  BookingConfirmationView,
  BookingDayView,
  BookingDurationView,
  BookingFormView,
  BookingProgressView,
  BookingSelectionView,
  BookingSlotView,
  BookingState,
  BookingView,
  ResolvedBookingField,
  SelectionStatus,
  SubmitStatus,
} from '@nickkupriyanov/slotline-core';

/* -- Errors, identity and context ------------------------------------------- */

export {
  BOOKING_ERROR_CODES,
  BookingError,
  guaranteesNotCreated,
  isAbortError,
  isBookingError,
  isBookingErrorCode,
  toBookingError,
  createIdempotencyKey,
  DEFAULT_BOOKING_CONTEXT,
  DEFAULT_CONTEXT_KEY,
  contextKeyOf,
} from '@nickkupriyanov/slotline-core';

/* -- Time ------------------------------------------------------------------- */

export {
  createTimeAnchor,
  isRetrySafe,
  midnightAfter,
  retryWindowClosesAt,
  soonestBoundary,
  systemClock,
  timeAnchorKey,
} from '@nickkupriyanov/slotline-core';

/* -- Date helpers ----------------------------------------------------------- */

export {
  addDays,
  addMonths,
  buildMonthGrid,
  clampDayKey,
  compareDayKeys,
  dayKeyOf,
  dayKeyOfInstant,
  detectLocale,
  endOf,
  formatFullDay,
  formatMonthYear,
  formatTime,
  formatTimeZoneName,
  formatUtcOffset,
  instantOf,
  instantOfZonedTime,
  isDayKey,
  isRepeatedLocalTime,
  monthKeyOf,
  resolveTimeZone,
  todayKey,
  wallKeyOf,
  zoneOffsetMs,
} from '@nickkupriyanov/slotline-core';
export type { InstantLike } from '@nickkupriyanov/slotline-core';

/* -- Copy and the mock adapter ---------------------------------------------- */

export { defaultMessages, format, resolveMessages } from '@nickkupriyanov/slotline-core';
export { createMockAdapter, SLOT_CLASS, cx } from '@nickkupriyanov/slotline-core';
export type { MockAdapterOptions, MockFailure } from '@nickkupriyanov/slotline-core';
export {
  DEFAULT_BOOKING_FIELDS,
  DEFAULT_DURATION_OPTIONS,
  DEFAULT_FORM_MODE,
  DEFAULT_MODE,
  DEFAULT_TIME_FORMAT,
  FALLBACK_LOCALE,
  FALLBACK_TIME_ZONE,
  FLOW_STEP_ORDER,
} from '@nickkupriyanov/slotline-core';

export type {
  AnimationKit,
  AvailabilityAdapter,
  AvailabilityQuery,
  BookingAdapter,
  BookingAttemptOutcome,
  BookingCapabilities,
  BookingChangeMetadata,
  BookingClock,
  BookingContext,
  BookingDetails,
  BookingErrorCode,
  BookingInvitation,
  BookingRequest,
  BookingResult,
  BookingSelection,
  BookingTimeAnchor,
  BookingValues,
  DayAvailability,
  DefaultBookingValues,
  HeightProps,
  InitialBookingAttempt,
  LoadStatus,
  SelectionChangeReason,
  SlotlineClassSlot,
  SlotlineMessages,
  SlotlineProps,
  SlotlineProviderProps,
  SlotlineStep,
  SlotlineTheme,
  SlotsQuery,
  StaggerItemProps,
  StepHostProps,
  TimeFormat,
  TimeSlot,
} from './types';
