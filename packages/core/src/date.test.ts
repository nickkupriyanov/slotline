import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  buildMonthGrid,
  clampDayKey,
  compareDayKeys,
  dayKeyOf,
  dayKeyOfInstant,
  daysInMonth,
  endOf,
  firstDayOfMonth,
  formatFullDay,
  formatMonthYear,
  formatTime,
  lastDayOfMonth,
  monthKeyOf,
  rotateToWeekStart,
  shortWeekdayNames,
  startOfWeek,
  todayKey,
  weekdayIndex,
  weekdayNames,
  instantOfZonedTime,
  zoneOffsetMs,
} from './date';

describe('calendar day keys', () => {
  it('derives the day from an instant in the requested zone', () => {
    const instant = new Date('2026-05-18T23:30:00Z');
    expect(dayKeyOf(instant, 'Europe/Berlin')).toBe('2026-05-19');
    expect(dayKeyOf(instant, 'America/New_York')).toBe('2026-05-18');
    expect(dayKeyOf(instant, 'UTC')).toBe('2026-05-18');
  });

  it('reads day keys out of ISO strings', () => {
    expect(dayKeyOfInstant('2026-05-18T00:30:00+02:00', 'UTC')).toBe('2026-05-17');
  });

  it('resolves today in a zone', () => {
    expect(todayKey('UTC', new Date('2026-05-18T10:00:00Z'))).toBe('2026-05-18');
    expect(todayKey('Pacific/Kiritimati', new Date('2026-05-18T10:00:00Z'))).toBe('2026-05-19');
  });

  it('does simple calendar arithmetic across DST boundaries', () => {
    // Europe/Berlin springs forward on 2026-03-29; day maths must not care.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });

  it('exposes month boundaries', () => {
    expect(firstDayOfMonth('2026-05')).toBe('2026-05-01');
    expect(lastDayOfMonth('2026-05')).toBe('2026-05-31');
    expect(lastDayOfMonth('2024-02')).toBe('2024-02-29');
    expect(daysInMonth('2026-02')).toBe(28);
    expect(monthKeyOf('2026-05-18')).toBe('2026-05');
  });

  it('compares and clamps keys', () => {
    expect(compareDayKeys('2026-05-01', '2026-05-02')).toBe(-1);
    expect(compareDayKeys('2026-05-02', '2026-05-02')).toBe(0);
    expect(clampDayKey('2026-04-01', '2026-05-01', '2026-05-31')).toBe('2026-05-01');
    expect(clampDayKey('2026-06-15', '2026-05-01', '2026-05-31')).toBe('2026-05-31');
  });
});

describe('month grid', () => {
  it('starts on the configured weekday and covers six weeks', () => {
    const sundayFirst = buildMonthGrid('2026-05', 0);
    expect(sundayFirst).toHaveLength(42);
    expect(sundayFirst[0]).toBe('2026-04-26');
    expect(sundayFirst[41]).toBe('2026-06-06');

    const mondayFirst = buildMonthGrid('2026-05', 1);
    expect(mondayFirst[0]).toBe('2026-04-27');
  });

  it('knows weekdays', () => {
    expect(weekdayIndex('2026-05-18')).toBe(1); // Monday
    expect(weekdayIndex('2026-05-17')).toBe(0); // Sunday
    expect(startOfWeek('2026-05-18', 0)).toBe('2026-05-17');
    expect(startOfWeek('2026-05-18', 1)).toBe('2026-05-18');
  });

  it('rotates labels to the week start', () => {
    expect(rotateToWeekStart(['S', 'M', 'T'], 1)).toEqual(['M', 'T', 'S']);
    expect(rotateToWeekStart(['S', 'M', 'T'], 0)).toEqual(['S', 'M', 'T']);
  });
});

describe('formatting', () => {
  it('formats month, day and time', () => {
    expect(formatMonthYear('2026-05', 'en')).toBe('May 2026');
    expect(formatFullDay('2026-05-18', 'en')).toBe('Monday, May 18');
    expect(formatTime('2026-05-18T07:15:00Z', 'Europe/Berlin', 'en')).toBe('09:15');
    expect(formatTime('2026-05-18T07:15:00Z', 'UTC', 'en')).toBe('07:15');
  });

  it('does not shift day formatting by time zone', () => {
    // The day key is a calendar day; formatting must not depend on the host zone.
    expect(formatFullDay('2026-05-01', 'en')).toBe('Friday, May 1');
  });

  it('produces weekday headers', () => {
    expect(shortWeekdayNames('en', ['S', 'M', 'T', 'W', 'T', 'F', 'S'])).toHaveLength(7);
    expect(shortWeekdayNames('en', undefined)).toHaveLength(7);
    expect(weekdayNames('en')).toHaveLength(7);
  });
});

describe('slots', () => {
  it('derives the end of a slot from the duration', () => {
    expect(endOf({ start: '2026-05-18T09:15:00Z' }, 15)).toBe('2026-05-18T09:30:00.000Z');
    expect(endOf({ start: '2026-05-18T09:15:00Z', end: '2026-05-18T09:45:00Z' }, 15)).toBe(
      '2026-05-18T09:45:00Z',
    );
  });
});

describe('zone arithmetic', () => {
  it('measures the offset of a zone at an instant', () => {
    const instant = new Date('2026-05-18T12:00:00Z');

    expect(zoneOffsetMs(instant, 'UTC')).toBe(0);
    expect(zoneOffsetMs(instant, 'Europe/Berlin')).toBe(2 * 60 * 60 * 1000);
    expect(zoneOffsetMs(instant, 'Asia/Tokyo')).toBe(9 * 60 * 60 * 1000);
    expect(zoneOffsetMs(instant, 'America/New_York')).toBe(-4 * 60 * 60 * 1000);
  });

  it('follows the seasonal offset of a zone', () => {
    const winter = new Date('2026-01-15T12:00:00Z');
    const summer = new Date('2026-07-15T12:00:00Z');

    expect(zoneOffsetMs(winter, 'Europe/Berlin')).toBe(60 * 60 * 1000);
    expect(zoneOffsetMs(summer, 'Europe/Berlin')).toBe(2 * 60 * 60 * 1000);
  });

  it('turns a local wall time into the right instant', () => {
    expect(instantOfZonedTime('2026-05-18', 0, 'UTC').toISOString()).toBe(
      '2026-05-18T00:00:00.000Z',
    );
    // Local midnight in Berlin is 22:00 UTC the day before while DST is on.
    expect(instantOfZonedTime('2026-05-18', 0, 'Europe/Berlin').toISOString()).toBe(
      '2026-05-17T22:00:00.000Z',
    );
    expect(instantOfZonedTime('2026-01-15', 0, 'Europe/Berlin').toISOString()).toBe(
      '2026-01-14T23:00:00.000Z',
    );
    expect(instantOfZonedTime('2026-05-18', 9 * 60 + 15, 'Asia/Tokyo').toISOString()).toBe(
      '2026-05-18T00:15:00.000Z',
    );
  });

  it('places a wall time on the correct side of a transition', () => {
    // 2026-03-29: 02:00 local becomes 03:00, so 01:00 is still +1 and 12:00 is +2.
    expect(instantOfZonedTime('2026-03-29', 60, 'Europe/Berlin').toISOString()).toBe(
      '2026-03-29T00:00:00.000Z',
    );
    expect(instantOfZonedTime('2026-03-29', 12 * 60, 'Europe/Berlin').toISOString()).toBe(
      '2026-03-29T10:00:00.000Z',
    );
    // 2026-10-25: 03:00 local becomes 02:00, so 12:00 is back on +1.
    expect(instantOfZonedTime('2026-10-25', 12 * 60, 'Europe/Berlin').toISOString()).toBe(
      '2026-10-25T11:00:00.000Z',
    );
  });
});
