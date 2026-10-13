/**
 * The public surface shared by `@nickkupriyanov/slotline-react` and `@nickkupriyanov/slotline-react/motion`.
 * Each entry point adds its own `Slotline` component bound to an animation kit.
 *
 * Framework-free modules are re-exported straight from
 * `@nickkupriyanov/slotline-core`, so the React package keeps the exact same
 * public API it had when they lived here.
 */

export { SlotlineProvider, createSlotline } from './Slotline';
export { SlotlineView } from './components/SlotlineView';
export { useBookingFlow } from './useBookingFlow';
export type { UseBookingFlowResult } from './useBookingFlow';
export {
  FlowContext,
  UIContext,
  useAnimations,
  useSlotlineContext,
  useClassNames,
  useUI,
} from './context';
export type { SlotlineUIContextValue } from './context';
export { cssAnimations } from './animations/css';

export { createMockAdapter } from '@nickkupriyanov/slotline-core';
export type { MockAdapterOptions } from '@nickkupriyanov/slotline-core';
export { SLOT_CLASS } from '@nickkupriyanov/slotline-core';
export { cx } from '@nickkupriyanov/slotline-core';

export {
  addDays,
  addMonths,
  buildMonthGrid,
  compareDayKeys,
  dayKeyOf,
  dayKeyOfInstant,
  formatFullDay,
  formatMonthYear,
  formatTime,
  formatTimeZoneName,
  isDayKey,
  monthKeyOf,
  todayKey,
} from '@nickkupriyanov/slotline-core';

export { defaultMessages, format, resolveMessages } from '@nickkupriyanov/slotline-core';

export {
  FLOW_STEPS,
  countSlots,
  createFlowState,
  flowReducer,
  stepIndex,
  validateDetails,
} from '@nickkupriyanov/slotline-core';
export type { FieldErrors, FlowAction, FlowState } from '@nickkupriyanov/slotline-core';

export type {
  AnimationKit,
  AvailabilityQuery,
  SlotlineClassSlot,
  SlotlineMessages,
  SlotlineProps,
  SlotlineProviderProps,
  SlotlineStep,
  SlotlineTheme,
  BookingAdapter,
  BookingDetails,
  BookingRequest,
  BookingResult,
  DayAvailability,
  HeightProps,
  LoadStatus,
  SlotsQuery,
  StaggerItemProps,
  StepHostProps,
  TimeSlot,
} from './types';
