import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { createMockAdapter, type BookingAdapter } from '@nickkupriyanov/slotline-core';
import { SlotlineService } from './slotline.service';

const NOW = Date.parse('2026-05-04T09:00:00Z');

function adapter(): BookingAdapter {
  return createMockAdapter({
    latency: 0,
    horizonDays: 30,
    timeZone: 'UTC',
    busyRatio: 0,
    now: () => NOW,
  });
}

/**
 * The controller validates its answer, resolves a fresh state and notifies the
 * snapshot cache, each of which needs its own turn of the microtask queue.
 */
async function flush(): Promise<void> {
  for (let index = 0; index < 25; index += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

function makeService(): SlotlineService {
  TestBed.configureTestingModule({
    providers: [SlotlineService, provideZonelessChangeDetection()],
  });
  return TestBed.inject(SlotlineService);
}

describe('SlotlineService', () => {
  it('has nothing to show before it is configured', () => {
    const service = makeService();

    expect(service.view()).toBeNull();
    expect(service.state()).toBeNull();
    expect(service.ready).toBe(false);
  });

  it('refuses to hand out actions before it is configured', () => {
    const service = makeService();

    expect(() => service.actions).toThrowError(/before configure/);
  });

  it('exposes the derived view once it is configured', () => {
    const service = makeService();

    service.configure({
      adapter: adapter(),
      config: { locale: 'en', minDate: '2026-05-04', maxDate: '2026-05-31' },
      inputs: { timeZone: 'UTC' },
    });

    const view = service.view();
    expect(service.ready).toBe(true);
    expect(view?.step).toBe('date');
    expect(view?.month.key).toBe('2026-05');
    expect(view?.month.grid).toHaveLength(42);
    expect(service.snapshot()?.revision).toBeGreaterThan(0);
  });

  it('follows the controller when an action changes the flow', () => {
    const service = makeService();
    service.configure({
      adapter: adapter(),
      config: { minDate: '2026-05-04', maxDate: '2026-05-31' },
      inputs: { timeZone: 'UTC' },
      initialTime: NOW,
    });

    service.actions.nextMonth();

    expect(service.view()?.month.key).toBe('2026-06');
    expect(service.state()?.month).toBe('2026-06');
  });

  it('loads availability once it is started', async () => {
    const service = makeService();
    service.configure({
      adapter: adapter(),
      config: { minDate: '2026-05-04', maxDate: '2026-05-31' },
      inputs: { timeZone: 'UTC' },
      initialTime: NOW,
    });

    expect(service.state()?.daysStatus).toBe('idle');
    service.start();
    await flush();

    expect(service.state()?.daysStatus).toBe('ready');
    expect(service.view()?.days['2026-05-04']?.bookable).toBe(true);
  });

  it('keeps the controller in step when the configuration changes', () => {
    const service = makeService();
    service.configure({ adapter: adapter(), config: {}, inputs: { timeZone: 'UTC' } });

    service.configure({ adapter: adapter(), config: {}, inputs: { timeZone: 'Europe/Berlin' } });

    expect(service.view()?.settings.timeZone).toBe('Europe/Berlin');
  });

  it('releases its subscription when it is stopped', () => {
    const service = makeService();
    service.configure({ adapter: adapter(), config: {}, inputs: { timeZone: 'UTC' } });
    const seen = service.view()?.month.key;

    service.stop();
    service.actions.nextMonth();

    expect(service.view()?.month.key).toBe(seen);
  });

  it('resolves the copy for the active locale', () => {
    const service = makeService();

    service.configure({
      adapter: adapter(),
      config: { locale: 'ru' },
      inputs: { timeZone: 'UTC' },
    });

    expect(service.messages().title).toBe('Записаться на встречу');
    expect(service.view()?.title).toBe('Записаться на встречу');
  });

  it('hands out the time reference for server rendering', () => {
    const service = makeService();
    service.configure({
      adapter: adapter(),
      config: {},
      inputs: { timeZone: 'UTC' },
      initialTime: NOW,
    });

    expect(service.getTimeAnchor()).toEqual({ nowMs: NOW, today: '2026-05-04' });
  });
});
