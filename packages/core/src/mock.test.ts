import { describe, expect, it } from 'vitest';
import { addDays, dayKeyOf, monthKeyOf, todayKey } from './date';
import { createMockAdapter } from './mock';

const noWait = { latency: 0 };
const controller = new AbortController();

describe('createMockAdapter', () => {
  it('only publishes open weekdays inside the requested range', async () => {
    const adapter = createMockAdapter({ ...noWait, horizonDays: 21, timeZone: 'UTC' });
    const from = todayKey('UTC');
    const to = addDays(from, 20);
    const days = await adapter.getAvailability({
      from,
      to,
      duration: 30,
      timeZone: 'UTC',
      signal: controller.signal,
    });

    expect(days.length).toBeGreaterThan(0);
    for (const day of days) {
      expect(day.date >= from && day.date <= to).toBe(true);
      const weekday = new Date(`${day.date}T12:00:00Z`).getUTCDay();
      expect(weekday).not.toBe(0);
      expect(weekday).not.toBe(6);
    }
  });

  it('never advertises a slot count it cannot deliver', async () => {
    const adapter = createMockAdapter({ ...noWait, horizonDays: 14, timeZone: 'UTC' });
    const from = todayKey('UTC');
    const days = await adapter.getAvailability({
      from,
      to: addDays(from, 13),
      duration: 15,
      timeZone: 'UTC',
      signal: controller.signal,
    });

    for (const day of days) {
      const slots = await adapter.getSlots({
        date: day.date,
        duration: 15,
        timeZone: 'UTC',
        signal: controller.signal,
      });
      expect(slots.length).toBe(day.slotCount);
      // Slots are real instants in the requested zone and always in the future.
      for (const slot of slots) {
        expect(dayKeyOf(new Date(slot.start), 'UTC')).toBe(day.date);
        expect(new Date(slot.start).getTime()).toBeGreaterThan(Date.now());
      }
    }
  });

  it('keeps the requested duration between slots', async () => {
    const adapter = createMockAdapter({ ...noWait, horizonDays: 14, timeZone: 'UTC' });
    const from = todayKey('UTC');
    const days = await adapter.getAvailability({
      from,
      to: addDays(from, 13),
      duration: 30,
      timeZone: 'UTC',
      signal: controller.signal,
    });
    const first = days[0];
    expect(first).toBeDefined();

    const slots = await adapter.getSlots({
      date: first!.date,
      duration: 30,
      timeZone: 'UTC',
      signal: controller.signal,
    });
    for (const slot of slots) {
      expect(new Date(slot.end!).getTime() - new Date(slot.start).getTime()).toBe(30 * 60_000);
    }
  });

  it('honours the workday window and the time zone', async () => {
    const adapter = createMockAdapter({
      ...noWait,
      horizonDays: 21,
      timeZone: 'Asia/Tokyo',
      workday: { start: 9 * 60, end: 12 * 60 },
      busyRatio: 0,
    });
    const from = todayKey('Asia/Tokyo');
    const days = await adapter.getAvailability({
      from,
      to: addDays(from, 20),
      duration: 60,
      timeZone: 'Asia/Tokyo',
      signal: controller.signal,
    });
    const day = days.find((candidate) => candidate.date > from) ?? days[0];
    expect(day).toBeDefined();

    const slots = await adapter.getSlots({
      date: day!.date,
      duration: 60,
      timeZone: 'Asia/Tokyo',
      signal: controller.signal,
    });
    expect(slots).toHaveLength(3);
    expect(monthKeyOf(dayKeyOf(new Date(slots[0]!.start), 'Asia/Tokyo'))).toBe(
      monthKeyOf(day!.date),
    );
  });

  it('confirms a booking with the invitee email', async () => {
    const adapter = createMockAdapter(noWait);
    const result = await adapter.createBooking({
      slot: { start: '2026-05-18T09:15:00Z' },
      date: '2026-05-18',
      duration: 15,
      timeZone: 'UTC',
      details: { name: 'Ann', email: 'ann@example.com' },
    });
    expect(result.inviteeEmail).toBe('ann@example.com');
    expect(typeof result.id).toBe('string');
  });
});
