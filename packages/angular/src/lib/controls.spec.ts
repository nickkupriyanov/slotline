import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { createMockAdapter } from '@nickkupriyanov/slotline-core';
import { SlotlineComponent } from './slotline.component';

const NOW = Date.parse('2026-05-04T09:00:00Z');
const DAY = '2026-05-04';

function adapter() {
  return createMockAdapter({
    latency: 0,
    horizonDays: 40,
    timeZone: 'UTC',
    busyRatio: 0,
    now: () => NOW,
  });
}

/**
 * The two optional controls.
 *
 * They are off unless the application asks for them, and switching either is
 * presentation only: the offers are the same instants, shown differently.
 */
@Component({
  selector: 'sl-controls-host',
  standalone: true,
  imports: [SlotlineComponent],
  template: `<sl-slotline
    [adapter]="adapter"
    [showTimeZoneSelector]="true"
    [showTimeFormatSelector]="true"
    [timeZones]="zones"
    defaultTimeZone="UTC"
    locale="en"
    minDate="2026-05-04"
    maxDate="2026-05-31"
    (timeZoneChange)="changed.set($event.timeZone)"
  />`,
})
class ControlsHostComponent {
  readonly adapter = adapter();
  readonly zones = ['UTC', 'Europe/Berlin', 'Asia/Tokyo'];
  readonly changed = signal<string | null>(null);
}

@Component({
  selector: 'sl-plain-host',
  standalone: true,
  imports: [SlotlineComponent],
  template: `<sl-slotline [adapter]="adapter" locale="en" timeZone="UTC" />`,
})
class PlainHostComponent {
  readonly adapter = adapter();
}

async function settle<H>(fixture: ComponentFixture<H>): Promise<void> {
  fixture.detectChanges();
  for (let tick = 0; tick < 25; tick += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function query<H>(fixture: ComponentFixture<H>, selector: string): HTMLElement {
  const element = (fixture.nativeElement as HTMLElement).querySelector(
    selector,
  ) as HTMLElement | null;
  if (!element) throw new Error(`expected to find ${selector}`);
  return element;
}

async function mount<H>(component: new () => H): Promise<ComponentFixture<H>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

async function reachOffers<H>(fixture: ComponentFixture<H>): Promise<void> {
  query(fixture, `[data-day="${DAY}"]`).click();
  await settle(fixture);
}

describe('the Angular controls', () => {
  it('offers nothing unless the application asked for it', async () => {
    const fixture = await mount(PlainHostComponent);
    expect((fixture.nativeElement as HTMLElement).querySelector('.sl-controls')).toBeNull();
  });

  it('switches the zone the offers are shown in and reports it', async () => {
    const fixture = await mount(ControlsHostComponent);
    await reachOffers(fixture);

    const before = query(fixture, '.sl-slot').textContent?.trim();

    query(fixture, '.sl-control-button').click();
    await settle(fixture);

    const popover = query(fixture, '.sl-popover');
    expect(popover.getAttribute('role')).toBe('dialog');

    // The search narrows a long list, and the zone ids are what it matches.
    const search = query(fixture, '.sl-popover input') as HTMLInputElement;
    search.value = 'berlin';
    search.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.sl-zone-option')).toHaveLength(
      1,
    );

    query(fixture, '.sl-zone-option').click();
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('.sl-popover')).toBeNull();
    expect(query(fixture, '.sl-control-value').textContent).toBe('GMT+2');
    expect(query(fixture, '.sl-slot').textContent?.trim()).not.toBe(before);
    expect(fixture.componentInstance.changed()).toBe('Europe/Berlin');
  });

  it('switches the 12/24 format without touching the offers', async () => {
    const fixture = await mount(ControlsHostComponent);
    await reachOffers(fixture);

    const labels = () =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('.sl-slot')].map((slot) =>
        slot.textContent?.trim(),
      );
    const before = labels();
    expect(before[0]).toBe('09:15');

    const twelve = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('.sl-segmented-option'),
    ].find((option) => option.textContent?.includes('12-hour')) as HTMLElement;
    twelve.click();
    await settle(fixture);

    expect(labels()).toHaveLength(before.length);
    expect(labels()[0]).toContain('9:15');
    expect(labels()[0]).toContain('AM');
  });
});
