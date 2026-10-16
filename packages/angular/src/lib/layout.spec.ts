import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { createMockAdapter } from '@nickkupriyanov/slotline-core';
import { SlotlineComponent } from './slotline.component';

const NOW = Date.parse('2026-05-04T09:00:00Z');

function adapter() {
  return createMockAdapter({
    latency: 0,
    horizonDays: 40,
    timeZone: 'UTC',
    busyRatio: 0,
    now: () => NOW,
  });
}

@Component({
  selector: 'sl-adaptive-host',
  standalone: true,
  imports: [SlotlineComponent],
  template: `<sl-slotline
    [adapter]="adapter"
    layout="adaptive"
    timeZone="UTC"
    locale="en"
    minDate="2026-05-04"
    maxDate="2026-05-31"
  />`,
})
class AdaptiveHostComponent {
  readonly adapter = adapter();
}

@Component({
  selector: 'sl-compact-host',
  standalone: true,
  imports: [SlotlineComponent],
  template: `<sl-slotline
    [adapter]="adapter"
    layout="compact"
    timeZone="UTC"
    locale="en"
    minDate="2026-05-04"
    maxDate="2026-05-31"
  />`,
})
class CompactHostComponent {
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

async function mount<H>(component: new () => H): Promise<ComponentFixture<H>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

describe('the adaptive layout', () => {
  it('composes the calendar and the offers side by side on the time step', async () => {
    const fixture = await mount(AdaptiveHostComponent);
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.sl-root')?.getAttribute('data-sl-layout')).toBe('adaptive');

    host.querySelector<HTMLElement>('[data-day="2026-05-04"]')?.click();
    await settle(fixture);

    const pair = host.querySelector('.sl-adaptive-pair');
    expect(pair).not.toBeNull();
    // The calendar is the month grid's own container, rendered from the same template
    // the date step uses, and the offers are the second column.
    expect(pair?.children).toHaveLength(2);
    expect(pair?.querySelector('.sl-calendar')).not.toBeNull();
    expect(pair?.querySelectorAll('.sl-slot').length).toBeGreaterThan(0);
  });

  it('leaves the compact layout with a single step', async () => {
    const fixture = await mount(CompactHostComponent);
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLElement>('[data-day="2026-05-04"]')?.click();
    await settle(fixture);

    expect(host.querySelector('.sl-adaptive-pair')).not.toBeNull();
    expect(host.querySelectorAll('.sl-calendar')).toHaveLength(0);
  });
});
