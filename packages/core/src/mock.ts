/**
 * A dependency-free mock adapter.
 *
 * Use it to try the widget in five lines, in tests, or in Storybook — the API
 * shape is exactly what a real backend adapter looks like.
 *
 * It is also the reference implementation of the creation contract: a server
 * side that recognises idempotency keys, injectable failures for every category,
 * and an injectable clock so tests and stories never depend on the real one.
 */
import { addDays, instantOfZonedTime, todayKey } from './date';
import { BookingError } from './errors';
import type {
  BookingAdapter,
  BookingCapabilities,
  BookingErrorCode,
  BookingRequest,
  BookingResult,
  DayAvailability,
  TimeSlot,
} from './types';

/** One injected failure. `UNKNOWN_OUTCOME` is special — see `createBookingFailures`. */
export interface MockFailure {
  code: BookingErrorCode;
  message?: string;
  fieldErrors?: Record<string, string>;
}

export interface MockAdapterOptions {
  /** How many days ahead to publish availability. Default: `60`. */
  horizonDays?: number;
  /** Weekdays that stay closed, `0` = Sunday. Default: `[0, 6]`. */
  closedWeekdays?: number[];
  /** Working day in minutes since midnight. Default: `09:00–18:00`. */
  workday?: { start: number; end: number };
  /** Simulated latency in milliseconds. Default: `220`. */
  latency?: number;
  /** IANA zone the mock schedule lives in. Default: the browser zone. */
  timeZone?: string;
  /** Rough share of slots that are already taken, `0…1`. Default: `0.18`. */
  busyRatio?: number;
  /** Injectable clock in milliseconds. Default: `Date.now`. */
  now?: () => number;
  /**
   * Recognise a repeated `idempotencyKey` and return the stored booking.
   * Default: `true`.
   */
  idempotentCreate?: boolean;
  /** How long a key stays recognised. Default: 24 hours. */
  idempotencyRetentionMs?: number;
  /** Failures consumed in order by `getAvailability`. */
  availabilityFailures?: MockFailure[];
  /** Failures consumed in order by `getSlots`. */
  slotFailures?: MockFailure[];
  /**
   * Failures consumed in order by `createBooking`.
   *
   * `UNKNOWN_OUTCOME` records the booking *and* rejects, which is exactly the
   * case a safe retry has to solve: repeating the request with the same key
   * returns the booking that was created the first time.
   */
  createBookingFailures?: MockFailure[];
}

const DEFAULTS = {
  horizonDays: 60,
  closedWeekdays: [0, 6] as number[],
  workday: { start: 9 * 60, end: 18 * 60 },
  latency: 220,
  busyRatio: 0.18,
  idempotentCreate: true,
  idempotencyRetentionMs: 24 * 60 * 60 * 1000,
};

/** FNV-1a: stable across runs, so stories and tests see the same calendar. */
function hash(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function resolveTimeZone(timeZone?: string): string {
  if (timeZone) return timeZone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function createMockAdapter(options: MockAdapterOptions = {}): BookingAdapter {
  const config = { ...DEFAULTS, ...options };
  const timeZone = resolveTimeZone(options.timeZone);
  const closed = new Set(config.closedWeekdays);
  const now = options.now ?? Date.now;

  const availabilityFailures = [...(options.availabilityFailures ?? [])];
  const slotFailures = [...(options.slotFailures ?? [])];
  const createBookingFailures = [...(options.createBookingFailures ?? [])];

  /** Keys the server already acted on, so a repeat returns the same booking. */
  const created = new Map<string, BookingResult>();
  let serial = 0;

  /**
   * Offer identity: the local time the schedule publishes, independent of the
   * zone the widget renders in. Stable across a time zone change by design.
   */
  const slotId = (dayKey: string, minute: number) => `${dayKey}#${String(minute).padStart(4, '0')}`;

  const slotsForDay = (dayKey: string, duration: number): TimeSlot[] => {
    const weekday = new Date(`${dayKey}T12:00:00Z`).getUTCDay();
    if (closed.has(weekday)) return [];

    // Fully booked days keep the calendar honest.
    if (hash(`${dayKey}|closed`) % 11 === 0) return [];

    const step = Math.max(5, duration);
    const slots: TimeSlot[] = [];
    for (let minute = config.workday.start; minute + step <= config.workday.end; minute += step) {
      if ((hash(`${dayKey}|${minute}`) % 100) / 100 < config.busyRatio) continue;
      const start = instantOfZonedTime(dayKey, minute, timeZone);
      slots.push({
        id: slotId(dayKey, minute),
        start: start.toISOString(),
        end: new Date(start.getTime() + duration * 60_000).toISOString(),
      });
    }
    return slots;
  };

  const wait = (signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, config.latency);
      function onAbort() {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }
      signal?.addEventListener('abort', onAbort, { once: true });
    });

  const throwFailure = (failure: MockFailure): never => {
    throw new BookingError({
      code: failure.code,
      message: failure.message ?? `Mock failure: ${failure.code}`,
      ...(failure.fieldErrors ? { fieldErrors: failure.fieldErrors } : {}),
    });
  };

  const buildResult = (request: BookingRequest): BookingResult => {
    serial += 1;
    const digest = hash(
      `${request.slot.id}|${request.values.email}|${request.idempotencyKey}`,
    ).toString(36);
    // Without idempotent create a repeat is a second record, which is what the
    // "no server support" scenario has to demonstrate.
    const suffix = config.idempotentCreate ? '' : `_${serial}`;
    return {
      id: `mock_${digest}${suffix}`,
      status: 'confirmed',
      invitation: { status: 'sent', email: request.values.email },
    };
  };

  const capabilities: BookingCapabilities = config.idempotentCreate
    ? { idempotentCreate: true, idempotencyRetentionMs: config.idempotencyRetentionMs }
    : { idempotentCreate: false };

  return {
    capabilities,

    async getAvailability({ from, to, duration, timeZone: viewZone, signal }) {
      await wait(signal);
      const failure = availabilityFailures.shift();
      if (failure) throwFailure(failure);

      const nowMs = now();
      const today = todayKey(viewZone, new Date(nowMs));
      const horizonEnd = addDays(today, config.horizonDays);
      const last = to < horizonEnd ? to : horizonEnd;
      const days: DayAvailability[] = [];

      for (
        let dayKey = from, guard = 0;
        dayKey <= last && guard < 400;
        dayKey = addDays(dayKey, 1)
      ) {
        guard += 1;
        if (dayKey < today) continue;
        // Same "not in the past" rule as `getSlots`, so a day never advertises a
        // slot count it cannot deliver.
        const slots = slotsForDay(dayKey, duration).filter(
          (slot) => new Date(slot.start).getTime() > nowMs + 60_000,
        );
        if (slots.length > 0) days.push({ date: dayKey, slotCount: slots.length });
      }
      return days;
    },

    async getSlots({ date, duration, timeZone: viewZone, signal }) {
      await wait(signal);
      const failure = slotFailures.shift();
      if (failure) throwFailure(failure);

      const nowMs = now();
      const today = todayKey(viewZone, new Date(nowMs));
      // Never deliver what `getAvailability` would not advertise.
      if (date < today || date > addDays(today, config.horizonDays)) return [];

      return slotsForDay(date, duration).filter(
        (slot) => new Date(slot.start).getTime() > nowMs + 60_000,
      );
    },

    async createBooking(request) {
      await wait();

      if (config.idempotentCreate) {
        const repeated = created.get(request.idempotencyKey);
        if (repeated) return repeated;
      }

      const result = buildResult(request);
      const failure = createBookingFailures.shift();
      if (failure) {
        // The record exists while the client never saw the response: this is the
        // only way to reach an outcome that is genuinely unknown.
        if (failure.code === 'UNKNOWN_OUTCOME') created.set(request.idempotencyKey, result);
        throwFailure(failure);
      }

      if (config.idempotentCreate) created.set(request.idempotencyKey, result);
      return result;
    },
  };
}
