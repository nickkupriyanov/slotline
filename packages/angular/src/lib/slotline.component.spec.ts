import { Component, output, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type {
  AvailabilityAdapter,
  BookingChangeMetadata,
  BookingSelection,
} from '@nickkupriyanov/slotline-core';
import {
  createMockAdapter,
  type BookingAdapter,
  type BookingRequest,
} from '@nickkupriyanov/slotline-core';
import { SlotlineComponent } from './slotline.component';
import type { BookedEvent, DurationChangeEvent } from './types';

/**
 * A deterministic double: nothing is busy, the loader resolves immediately and
 * the horizon covers the visible month. Only the current instant comes from the
 * real clock, exactly as it does in a browser, so the suite passes on any day.
 */
function mockAdapter(): BookingAdapter {
  return createMockAdapter({
    latency: 0,
    horizonDays: 40,
    timeZone: 'UTC',
    busyRatio: 0,
  });
}

/**
 * The widget is mounted the way an application mounts it — through bindings on a
 * host component — so the inputs are provided exactly as a consumer provides them.
 */
@Component({
  selector: 'sl-test-host',
  standalone: true,
  imports: [SlotlineComponent],
  template: `<sl-slotline
    [adapter]="adapter"
    [timeZone]="timeZone()"
    [locale]="locale()"
    (booked)="booked.emit($event)"
    (durationChange)="durationChange.emit($event)"
  />`,
})
class TestHostComponent {
  readonly adapter = mockAdapter();
  readonly timeZone = signal('UTC');
  readonly locale = signal('en');
  readonly booked = output<BookedEvent>();
  readonly durationChange = output<DurationChangeEvent>();
}

async function mount(): Promise<ComponentFixture<TestHostComponent>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(TestHostComponent);
  fixture.detectChanges();
  // Days stay unavailable until the first availability answer arrives.
  await settle(fixture);
  return fixture;
}

/**
 * Lets change detection settle *and* drains the controller's loader, which is a
 * plain promise chain: `whenStable` alone does not spin the microtask queue for
 * that many turns.
 */
async function settle<H = unknown>(fixture: ComponentFixture<H>): Promise<void> {
  fixture.detectChanges();
  for (let tick = 0; tick < 25; tick += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function query<T extends Element, H = unknown>(fixture: ComponentFixture<H>, selector: string): T {
  const element = fixture.nativeElement.querySelector(selector) as T | null;
  if (!element) throw new Error(`expected to find ${selector}`);
  return element;
}

function queryAll<T extends Element, H = unknown>(
  fixture: ComponentFixture<H>,
  selector: string,
): T[] {
  return Array.from(fixture.nativeElement.querySelectorAll(selector)) as T[];
}

function cells<H = unknown>(fixture: ComponentFixture<H>): HTMLButtonElement[] {
  return queryAll<HTMLButtonElement>(fixture, '[role="gridcell"]');
}

function bookableCells<H = unknown>(fixture: ComponentFixture<H>): HTMLButtonElement[] {
  return cells(fixture).filter((cell) => cell.getAttribute('aria-disabled') !== 'true');
}

function firstBookableDay<H = unknown>(fixture: ComponentFixture<H>): HTMLButtonElement {
  const cell = bookableCells(fixture)[0];
  if (!cell) throw new Error('expected at least one bookable day');
  return cell;
}

async function reachSlots<H = unknown>(fixture: ComponentFixture<H>): Promise<void> {
  firstBookableDay(fixture).click();
  await settle(fixture);
}

async function reachDetails<H = unknown>(fixture: ComponentFixture<H>): Promise<void> {
  await reachSlots(fixture);
  const slot = queryAll<HTMLButtonElement>(fixture, '.sl-slot')[0];
  if (!slot) throw new Error('expected at least one offer');
  slot.click();
  await settle(fixture);
}

async function fillDetails<H = unknown>(fixture: ComponentFixture<H>): Promise<void> {
  for (const [label, value] of [
    ['Your name', 'Ann'],
    ['Email', 'ann@example.com'],
  ] as const) {
    const control = query<HTMLInputElement>(fixture, `input[aria-label="${label}"]`);
    control.value = value;
    control.dispatchEvent(new Event('input'));
  }
  await settle(fixture);
}

describe('SlotlineComponent', () => {
  it('renders the calendar with a single tab stop and unavailable days marked', async () => {
    const fixture = await mount();

    expect(query(fixture, '.sl-title').textContent?.trim()).toBe('Book a meeting');
    expect(query(fixture, '[role="grid"]').getAttribute('aria-label')).toBeTruthy();
    expect(cells(fixture)).toHaveLength(42);

    // Roving tabindex: exactly one cell is reachable with Tab.
    const tabbable = cells(fixture).filter((cell) => cell.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);

    // The grid pads the month, and the padding is announced as unavailable.
    const disabled = cells(fixture).filter((cell) => cell.getAttribute('aria-disabled') === 'true');
    expect(disabled.length).toBeGreaterThan(0);
    expect(bookableCells(fixture).length).toBeGreaterThan(0);
  });

  it('renders the duration options and reports a change', async () => {
    const fixture = await mount();
    const changes: number[] = [];
    fixture.componentInstance.durationChange.subscribe((event) => changes.push(event.duration));

    const pills = queryAll<HTMLButtonElement>(fixture, '[role="radiogroup"] [role="radio"]');
    expect(pills).toHaveLength(3);
    expect(pills.map((pill) => pill.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
    ]);

    pills[2]?.click();
    await settle(fixture);

    expect(changes).toEqual([60]);
    expect(query(fixture, '.sl-badge').textContent).toContain('60');
  });

  it('moves to the offers of the chosen day and announces the step', async () => {
    const fixture = await mount();

    await reachSlots(fixture);

    expect(queryAll(fixture, '.sl-slot').length).toBeGreaterThan(0);
    expect(query(fixture, '[role="status"]').textContent?.trim().length).toBeGreaterThan(0);
    expect(query(fixture, '.sl-icon-button')).toBeTruthy();
  });

  it('returns to the calendar from the offers', async () => {
    const fixture = await mount();
    await reachSlots(fixture);

    query<HTMLButtonElement>(fixture, '.sl-icon-button').click();
    await settle(fixture);

    expect(cells(fixture)).toHaveLength(42);
  });

  it('books end to end and reports the request it created', async () => {
    const fixture = await mount();
    const booked: Array<{ request: BookingRequest }> = [];
    fixture.componentInstance.booked.subscribe((event) => booked.push(event));

    const day = firstBookableDay(fixture).getAttribute('data-day');
    await reachDetails(fixture);
    await fillDetails(fixture);
    query<HTMLButtonElement>(fixture, '.sl-submit').click();
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain("You're booked");
    expect(booked).toHaveLength(1);
    expect(booked[0]?.request.date).toBe(day);
    expect(booked[0]?.request.values.email).toBe('ann@example.com');
    expect(booked[0]?.request.idempotencyKey).toEqual(expect.any(String));
  });

  it('moves focus through the calendar with the arrow keys', async () => {
    const fixture = await mount();
    const current = cells(fixture).find((cell) => cell.getAttribute('tabindex') === '0');
    current?.focus();
    const before = current?.getAttribute('data-day');

    current?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    await settle(fixture);

    const focused = document.activeElement as HTMLElement;
    expect(focused.getAttribute('data-day')).not.toBe(before);
    expect(focused.getAttribute('tabindex')).toBe('0');
  });

  it('renders the copy of the active locale', async () => {
    const fixture = await mount();
    fixture.componentInstance.locale.set('ru');
    fixture.detectChanges();

    expect(query(fixture, '.sl-title').textContent?.trim()).toBe('Записаться на встречу');
  });
});
