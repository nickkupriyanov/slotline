/**
 * Date helpers.
 *
 * Slotline deliberately avoids a date library: everything is either a plain
 * `YYYY-MM-DD` *calendar day* (a string, compared lexicographically) or an ISO
 * *instant* formatted through `Intl`. Calendar days are pure values with no time
 * zone attached, so they are computed in UTC and never shifted by DST.
 */
import type { TimeFormat, TimeSlot } from './types';

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

/**
 * Anything carrying an instant: a full `TimeSlot`, or a bare `{ start }` when
 * only the moment matters. The identity of an offer is never needed to format
 * it or to derive its end.
 */
export type InstantLike = Pick<TimeSlot, 'start' | 'end'>;

export function instantOf(slot: InstantLike): Date {
  return new Date(slot.start);
}

/** `slot.end`, or `start` + duration when the adapter only sent a start. */
export function endOf(slot: InstantLike, durationMinutes: number): string {
  if (slot.end) return slot.end;
  return new Date(instantOf(slot).getTime() + durationMinutes * 60_000).toISOString();
}

/* -------------------------------------------------------------------------- */
/*  Zone arithmetic                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Offset of `timeZone` at a given instant, in milliseconds east of UTC.
 *
 * `hourCycle: 'h23'` rather than `hour12: false` on purpose: some ICU versions
 * render midnight as hour `24` with `hour12: false`, which would put the offset a
 * whole day out exactly at the boundary `midnightAfter` cares about.
 */
export function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getFormatter('en-US', {
    timeZone,
    hourCycle: 'h23',
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

/**
 * The UTC instant of a local wall time in `timeZone`.
 *
 * `minutesFromMidnight` is measured from local midnight on `dayKey`. The offset is
 * measured at the guessed instant and again at the resolved one, so a transition
 * falling between the two does not leave the result an hour out. A wall time that
 * does not exist (the hour a spring transition skips) resolves to the instant the
 * clock shows right after the shift, which is the closest existing moment.
 */
export function instantOfZonedTime(
  dayKey: string,
  minutesFromMidnight: number,
  timeZone: string,
): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  const guess = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour, minute);
  const first = new Date(guess - zoneOffsetMs(new Date(guess), timeZone));
  return new Date(guess - zoneOffsetMs(first, timeZone));
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

/** "10:15", or "10:15 AM" when the 12-hour cycle is requested. */
export function formatTime(
  iso: string,
  timeZone: string,
  locale: string,
  timeFormat: TimeFormat = '24h',
): string {
  return getFormatter(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: timeFormat === '12h' ? 'h12' : 'h23',
  }).format(new Date(iso));
}

/**
 * The local wall time of an instant as `YYYY-MM-DDTHH:mm` in `timeZone`.
 *
 * Locale-independent on purpose: it is meant for comparisons, such as deciding
 * whether a local time occurs twice, not for display.
 */
export function wallKeyOf(date: Date, timeZone: string): string {
  const parts = getFormatter('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  }
  return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}`;
}

/**
 * `true` when the local time of an instant is not unique in `timeZone` — the hour
 * a daylight-saving fall-back repeats. Both passes are reported, because both are
 * ambiguous to a user reading a wall clock.
 */
export function isRepeatedLocalTime(iso: string, timeZone: string): boolean {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return false;
  const wall = wallKeyOf(new Date(at), timeZone);
  return (
    wallKeyOf(new Date(at - 3_600_000), timeZone) === wall ||
    wallKeyOf(new Date(at + 3_600_000), timeZone) === wall
  );
}

/** "+02:00" / "-04:00" — the offset of a zone at an instant. */
export function formatUtcOffset(iso: string, timeZone: string): string {
  const offsetMinutes = Math.round(zoneOffsetMs(new Date(iso), timeZone) / 60_000);
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  return `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
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

/**
 * The zones a selector offers.
 *
 * An explicit list wins, and keeps the application's order — with the current zone
 * added if it is missing, because a selector that cannot show where you are is worse
 * than no selector. Without a list the runtime is asked, and UTC and the current zone
 * are always present; where the runtime cannot enumerate zones, those two are all
 * there is.
 */
export function resolveTimeZoneOptions(current: string, listed?: readonly string[]): string[] {
  if (listed && listed.length > 0) {
    const zones = [...listed];
    if (!zones.includes(current)) zones.push(current);
    return [...new Set(zones)];
  }

  const supported =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set(['UTC', current, ...supported])].sort();
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
