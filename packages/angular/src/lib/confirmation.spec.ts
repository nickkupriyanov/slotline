import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  createMockAdapter,
  type BookingAdapter,
  type BookingResult,
} from '@nickkupriyanov/slotline-core';
import { SlotlineComponent } from './slotline.component';

const NOW = Date.parse('2026-05-04T09:00:00Z');
const DAY = '2026-05-04';

/** A booked record with exactly the fields the test wants to see. */
function adapterReturning(resultExtras: Partial<BookingResult>): BookingAdapter {
  return createMockAdapter({
    latency: 0,
    horizonDays: 40,
    timeZone: 'UTC',
    busyRatio: 0,
    now: () => NOW,
    resultExtras,
  });
}

@Component({
  selector: 'sl-confirmation-host',
  standalone: true,
  imports: [SlotlineComponent],
  template: `<sl-slotline
    [adapter]="adapter"
    timeZone="UTC"
    locale="en"
    minDate="2026-05-04"
    maxDate="2026-05-31"
  />`,
})
class ConfirmationHostComponent {
  adapter: BookingAdapter = adapterReturning({});
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

/** Books once and returns the fixture sitting on the confirmation. */
async function book(
  resultExtras: Partial<BookingResult>,
): Promise<ComponentFixture<ConfirmationHostComponent>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(ConfirmationHostComponent);
  fixture.componentInstance.adapter = adapterReturning(resultExtras);
  fixture.detectChanges();
  await settle(fixture);

  query(fixture, `[data-day="${DAY}"]`).click();
  await settle(fixture);
  query(fixture, '.sl-slot').click();
  await settle(fixture);

  for (const [label, value] of [
    ['Your name', 'Ann'],
    ['Email', 'ann@example.com'],
  ] as const) {
    const input = query(fixture, `input[aria-label="${label}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }
  await settle(fixture);
  query(fixture, '.sl-submit').click();
  await settle(fixture);
  return fixture;
}

describe('the extended confirmation in Angular', () => {
  it('shows the place, the instructions and every link that was returned', async () => {
    const fixture = await book({
      location: 'Studio 2, Torstraße 14',
      instructions: 'Ring the bell twice.',
      joinUrl: 'https://meet.example.com/abc',
      calendarUrl: 'https://calendar.example.com/abc.ics',
      rescheduleUrl: 'https://app.example.com/8/reschedule',
      cancelUrl: 'https://app.example.com/8/cancel',
    });

    expect(query(fixture, '.sl-confirmation-place').textContent).toContain(
      'Studio 2, Torstraße 14',
    );
    expect(query(fixture, '.sl-confirmation-instructions').textContent).toContain(
      'Ring the bell twice.',
    );

    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.sl-confirmation-actions a'),
    ).map((link) => link.textContent?.trim());
    expect(links).toEqual(['Join the meeting', 'Add to calendar', 'Reschedule', 'Cancel']);
  });

  it('leaves out every block the backend did not fill', async () => {
    const fixture = await book({});

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.sl-confirmation')).not.toBeNull();
    expect(host.querySelector('.sl-confirmation-place')).toBeNull();
    expect(host.querySelector('.sl-confirmation-instructions')).toBeNull();
    expect(host.querySelector('.sl-confirmation-actions')).toBeNull();
  });
});
