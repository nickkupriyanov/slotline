/**
 * The controller configuration.
 *
 * Everything the flow needs to know about the application is resolved once, so the
 * reducer, the derivation and both bindings work from identical values.
 *
 * `locale` and `timeZone` fall back to deterministic constants rather than to the
 * browser: a binding applies the browser preference *after* mounting, which is
 * what keeps server rendering and hydration identical. An application that passes
 * them explicitly gets the same answer on both sides with no extra work.
 */
import { DEFAULT_BOOKING_CONTEXT } from './context';
import { normalizeDateInput } from './date';
import { resolveBookingFields, type BookingFieldConfig, type ResolvedBookingField } from './fields';
import { resolveMessages } from './i18n';
import type {
  BookingCapabilities,
  BookingContext,
  BookingValues,
  SlotlineMessages,
  TimeFormat,
} from './types';

export type BookingMode = 'booking' | 'selection';
export type BookingFormMode = 'collect' | 'skip';

export interface BookingConfigInput {
  /** `booking` (default) creates a record; `selection` only reports a choice. */
  mode?: BookingMode;
  /** `collect` (default) renders the form; `skip` goes straight to the summary. */
  formMode?: BookingFormMode;
  locale?: string;
  messages?: Partial<SlotlineMessages>;
  timeZone?: string;
  timeFormat?: TimeFormat;
  weekStartsOn?: 0 | 1;
  durationOptions?: number[];
  showDurationSelector?: boolean;
  minDate?: string | Date;
  maxDate?: string | Date;
  context?: BookingContext;
  fields?: readonly BookingFieldConfig[];
  validateValues?(values: BookingValues): Record<string, string> | undefined;
  capabilities?: BookingCapabilities;
  title?: string;
  defaultValues?: BookingValues;
}

export interface BookingConfig {
  mode: BookingMode;
  formMode: BookingFormMode;
  locale: string;
  messages: SlotlineMessages;
  timeZone: string;
  timeFormat: TimeFormat;
  weekStartsOn: 0 | 1;
  durationOptions: number[];
  /** Whether the standard widget renders the duration picker at all. */
  showDurationSelector: boolean;
  /** Earliest selectable day, `YYYY-MM-DD` in `timeZone`. */
  minDate?: string;
  /** Latest selectable day, `YYYY-MM-DD` in `timeZone`. */
  maxDate?: string;
  context: BookingContext;
  fields: ResolvedBookingField[];
  validateValues?(values: BookingValues): Record<string, string> | undefined;
  capabilities?: BookingCapabilities;
  title?: string;
  defaultValues?: BookingValues;
}

export const DEFAULT_DURATION_OPTIONS: readonly number[] = [15, 30, 60];
export const DEFAULT_MODE: BookingMode = 'booking';
export const DEFAULT_FORM_MODE: BookingFormMode = 'collect';
export const DEFAULT_TIME_FORMAT: TimeFormat = '24h';

/** Deterministic fallbacks, replaced by a binding once it is running on the client. */
export const FALLBACK_LOCALE = 'en';
export const FALLBACK_TIME_ZONE = 'UTC';

export function resolveBookingConfig(input: BookingConfigInput = {}): BookingConfig {
  const locale = input.locale ? input.locale : FALLBACK_LOCALE;
  const timeZone = input.timeZone ? input.timeZone : FALLBACK_TIME_ZONE;
  const messages = resolveMessages(locale, input.messages);
  const durationOptions =
    input.durationOptions && input.durationOptions.length > 0
      ? [...input.durationOptions]
      : [...DEFAULT_DURATION_OPTIONS];

  const minDate = normalizeDateInput(input.minDate, timeZone);
  const maxDate = normalizeDateInput(input.maxDate, timeZone);

  return {
    mode: input.mode ?? DEFAULT_MODE,
    formMode: input.formMode ?? DEFAULT_FORM_MODE,
    locale,
    messages,
    timeZone,
    timeFormat: input.timeFormat ?? DEFAULT_TIME_FORMAT,
    weekStartsOn: input.weekStartsOn ?? 0,
    durationOptions,
    showDurationSelector: input.showDurationSelector ?? true,
    ...(minDate === undefined ? {} : { minDate }),
    ...(maxDate === undefined ? {} : { maxDate }),
    context: input.context ?? DEFAULT_BOOKING_CONTEXT,
    fields: resolveBookingFields(input.fields, messages),
    ...(input.validateValues ? { validateValues: input.validateValues } : {}),
    ...(input.capabilities ? { capabilities: input.capabilities } : {}),
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.defaultValues ? { defaultValues: input.defaultValues } : {}),
  };
}
