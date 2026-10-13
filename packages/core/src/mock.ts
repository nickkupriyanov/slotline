/**
 * A dependency-free mock adapter.
 *
 * Use it to try the widget in five lines, in tests, or in Storybook — the API
 * shape is exactly what a real backend adapter looks like.
 */
import { addDays } from './date';
import type { BookingAdapter, DayAvailability, TimeSlot } from './types';

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
}

const DEFAULTS = {
  horizonDays: 60,
  closedWeekdays: [0, 6],
  workday: { start: 9 * 60, end: 18 * 60 },
  latency: 220,
  busyRatio: 0.18,
} satisfies Omit<MockAdapterOptions, 'timeZone'>;

/** FNV-1a: stable across runs, so stories and tests see the same calendar. */
function hash(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const lookup: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(
    lookup.year ?? 1970,
    (lookup.month ?? 1) - 1,
    lookup.day ?? 1,
    lookup.hour ?? 0,
    lookup.minute ?? 0,
    lookup.second ?? 0,
  );
  return asUtc - date.getTime();
}

/** "09:15 on 2026-05-18 in Europe/Berlin" → the correct UTC instant (DST included). */
function zonedTimeToUtc(dayKey: string, minutesFromMidnight: number, timeZone: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  const guess = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour, minute);
  const offset = zoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset);
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

  const slotsForDay = (dayKey: string, duration: number): TimeSlot[] => {
    const weekday = new Date(`${dayKey}T12:00:00Z`).getUTCDay();
    if (closed.has(weekday)) return [];

    // Fully booked days keep the calendar honest.
    if (hash(`${dayKey}|closed`) % 11 === 0) return [];

    const step = Math.max(5, duration);
    const slots: TimeSlot[] = [];
    for (let minute = config.workday.start; minute + step <= config.workday.end; minute += step) {
      if ((hash(`${dayKey}|${minute}`) % 100) / 100 < config.busyRatio) continue;
      const start = zonedTimeToUtc(dayKey, minute, timeZone);
      slots.push({
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

  return {
    async getAvailability({ from, to, duration, signal }): Promise<DayAvailability[]> {
      await wait(signal);
      const days: DayAvailability[] = [];
      const now = Date.now();
      const today = new Date().toISOString().slice(0, 10);
      for (let dayKey = from, guard = 0; dayKey <= to && guard < 400; dayKey = addDays(dayKey, 1)) {
        guard += 1;
        if (dayKey < today) continue;
        // Same "not in the past" rule as `getSlots`, so a day never advertises a
        // slot count it cannot deliver.
        const slots = slotsForDay(dayKey, duration).filter(
          (slot) => new Date(slot.start).getTime() > now + 60_000,
        );
        if (slots.length > 0) days.push({ date: dayKey, slotCount: slots.length });
      }
      return days;
    },

    async getSlots({ date, duration, signal }): Promise<TimeSlot[]> {
      await wait(signal);
      const now = Date.now();
      return slotsForDay(date, duration).filter(
        (slot) => new Date(slot.start).getTime() > now + 60_000,
      );
    },

    async createBooking(request) {
      await wait();
      return {
        id: `mock_${hash(`${request.slot.start}|${request.details.email}`).toString(36)}`,
        inviteeEmail: request.details.email,
      };
    },
  };
}
