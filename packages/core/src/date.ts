/**
 * Date helpers.
 *
 * Slotline deliberately avoids a date library: everything is either a plain
 * `YYYY-MM-DD` *calendar day* (a string, compared lexicographically) or an ISO
 * *instant* formatted through `Intl`. Calendar days are pure values with no time
 * zone attached, so they are computed in UTC and never shifted by DST.
 */
import type { TimeSlot } from './types';

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/** Drops the cache; used by tests that stub `Intl`. */
export function clearFormatterCache(): void {
  formatterCache.clear();
}

/* -------------------------------------------------------------------------- */
/*  Day keys                                                                   */
/* -------------------------------------------------------------------------- */

export function isDayKey(value: unknown): value is string {
  return typeof value === 'string' && DAY_KEY_RE.test(value);
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && MONTH_KEY_RE.test(value);
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function toDayKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** UTC-noon anchor for a calendar day — immune to DST and offset drift. */
function anchorOf(dayKey: string): Date {
  const match = DAY_KEY_RE.exec(dayKey);
  if (!match) throw new RangeError(`Invalid day key: ${dayKey}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

function keyOfUtcDate(date: Date): string {
  return toDayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Calendar day of an instant, expressed in `timeZone`. */
export function dayKeyOf(date: Date, timeZone: string): string {
  const parts = getFormatter('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) lookup[part.type] = part.value;
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

/** Calendar day of an ISO instant string, expressed in `timeZone`. */
export function dayKeyOfInstant(iso: string, timeZone: string): string {
  return dayKeyOf(new Date(iso), timeZone);
}

export function todayKey(timeZone: string, now: Date = new Date()): string {
  return dayKeyOf(now, timeZone);
}

export function monthKeyOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}

export function firstDayOfMonth(monthKey: string): string {
  return `${monthKey}-01`;
}

export function daysInMonth(monthKey: string): number {
  const match = MONTH_KEY_RE.exec(monthKey);
  if (!match) throw new RangeError(`Invalid month key: ${monthKey}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
}

export function lastDayOfMonth(monthKey: string): string {
  return `${monthKey}-${pad(daysInMonth(monthKey))}`;
}

export function addDays(dayKey: string, amount: number): string {
  const date = anchorOf(dayKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return keyOfUtcDate(date);
}

export function addMonths(monthKey: string, amount: number): string {
  const match = MONTH_KEY_RE.exec(monthKey);
  if (!match) throw new RangeError(`Invalid month key: ${monthKey}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + amount, 1, 12));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

/** Weekday of a calendar day: `0` = Sunday … `6` = Saturday. */
export function weekdayIndex(dayKey: string): number {
  return anchorOf(dayKey).getUTCDay();
}

export function startOfWeek(dayKey: string, weekStartsOn: 0 | 1): string {
  const shift = (weekdayIndex(dayKey) - weekStartsOn + 7) % 7;
  return addDays(dayKey, -shift);
}

/**
 * The days drawn by the month view — always `weeks * 7` cells, starting on
 * `weekStartsOn`, padded with the neighbouring months (as in the reference design).
 */
export function buildMonthGrid(monthKey: string, weekStartsOn: 0 | 1, weeks = 6): string[] {
  const start = startOfWeek(firstDayOfMonth(monthKey), weekStartsOn);
  return Array.from({ length: weeks * 7 }, (_, index) => addDays(start, index));
}

/** Lexicographic comparison is correct for `YYYY-MM-DD` keys. */
export function compareDayKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function clampDayKey(dayKey: string, min?: string, max?: string): string {
  if (min && compareDayKeys(dayKey, min) < 0) return min;
  if (max && compareDayKeys(dayKey, max) > 0) return max;
  return dayKey;
}

export function isBetweenDayKeys(dayKey: string, min?: string, max?: string): boolean {
  if (min && compareDayKeys(dayKey, min) < 0) return false;
  if (max && compareDayKeys(dayKey, max) > 0) return false;
  return true;
}

/** Normalises the `minDate` / `maxDate` props to a day key in `timeZone`. */
export function normalizeDateInput(
  value: string | Date | undefined,
  timeZone: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (value instanceof Date) return dayKeyOf(value, timeZone);
  return isDayKey(value) ? value : dayKeyOf(new Date(value), timeZone);
}

/* -------------------------------------------------------------------------- */
/*  Instants                                                                   */
/* -------------------------------------------------------------------------- */

export function instantOf(slot: TimeSlot): Date {
  return new Date(slot.start);
}

/** `slot.end`, or `start` + duration when the adapter only sent a start. */
export function endOf(slot: TimeSlot, durationMinutes: number): string {
  if (slot.end) return slot.end;
  return new Date(instantOf(slot).getTime() + durationMinutes * 60_000).toISOString();
}

/* -------------------------------------------------------------------------- */
/*  Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/** "May 2026" */
export function formatMonthYear(monthKey: string, locale: string): string {
  const date = anchorOf(firstDayOfMonth(monthKey));
  return getFormatter(locale, { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(date);
}

/** "Monday, May 18" */
export function formatFullDay(dayKey: string, locale: string): string {
  return getFormatter(locale, {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(anchorOf(dayKey));
}

/** "10:15" in the requested time zone. */
export function formatTime(iso: string, timeZone: string, locale: string): string {
  return getFormatter(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** "GMT+2" / "CEST" — used only as a hint under the calendar. */
export function formatTimeZoneName(
  timeZone: string,
  locale: string,
  at: Date = new Date(),
): string | undefined {
  const parts = getFormatter(locale, { timeZone, timeZoneName: 'short' }).formatToParts(at);
  return parts.find((part) => part.type === 'timeZoneName')?.value;
}

export function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Long weekday names, Sunday-first — used for accessible headers. */
export function weekdayNames(locale: string): string[] {
  const formatter = getFormatter(locale, { timeZone: 'UTC', weekday: 'long' });
  const sunday = anchorOf('2024-01-07'); // a Sunday
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(sunday.getTime() + index * 86_400_000)),
  );
}

/** Short weekday labels, Sunday-first. Falls back to `Intl` narrow names. */
export function shortWeekdayNames(locale: string, provided?: string[]): string[] {
  if (provided && provided.length === 7) return provided;
  const formatter = getFormatter(locale, { timeZone: 'UTC', weekday: 'narrow' });
  const sunday = anchorOf('2024-01-07');
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(sunday.getTime() + index * 86_400_000)),
  );
}

/** Rotates a Sunday-first array so it starts on `weekStartsOn`. */
export function rotateToWeekStart<T>(values: T[], weekStartsOn: 0 | 1): T[] {
  if (weekStartsOn === 0) return values;
  return [...values.slice(weekStartsOn), ...values.slice(0, weekStartsOn)];
}
