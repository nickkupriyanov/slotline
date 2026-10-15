import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  createMockAdapter,
  type AvailabilityAdapter,
  type BookingSelection,
} from '@nickkupriyanov/slotline-core';
import { SlotlinePartDirective } from './parts';
import { SlotlineComponent } from './slotline.component';

const NOW = Date.parse('2026-05-04T09:00:00Z');
const DAY = '2026-05-04';

/** A pinned calendar and instant answers, so the tests never depend on the clock. */
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
  selector: 'sl-parts-host',
  standalone: true,
  imports: [SlotlineComponent, SlotlinePartDirective],
  template: `<sl-slotline
    [adapter]="adapter"
    timeZone="UTC"
    locale="en"
    minDate="2026-05-04"
    maxDate="2026-05-31"
    [fields]="fields"
    (selectionChange)="picked.set($event.selection)"
  >
    <ng-template slSlotlinePart="slot" let-slot let-slotProps="slotProps">
      <button
        type="button"
        class="priced-slot"
        [class]="slotProps.className"
        [attr.aria-label]="slotProps['aria-label'] ?? slot.label"
        [attr.aria-current]="slotProps['aria-current']"
        (click)="slotProps.onClick()"
      >
        {{ slot.label }} <span class="price">€90</span>
      </button>
    </ng-template>

    <ng-template slSlotlinePart="dayContent" let-day>
      <span class="custom-day">{{ day.day.slice(8, 10) }}</span>
    </ng-template>

    <ng-template slSlotlinePart="form" let-form let-actions="actions">
      <form class="custom-form" (submit)="submit($event, actions)">
        <input
          aria-label="Email only"
          [value]="form.values['email'] ?? ''"
          (input)="actions.setValues({ email: $any($event.target).value })"
          (blur)="actions.touchField('email')"
        />
        @if (form.visibleErrors['email']; as error) {
          <p role="alert">{{ error }}</p>
        }
        <button type="submit">Send</button>
      </form>
    </ng-template>

    <ng-template slSlotlinePart="confirmation" let-confirmation let-actions="actions">
      <div class="custom-confirmation">
        <p>{{ confirmation.title }}</p>
        <button type="button" (click)="actions.reset()">Again</button>
      </div>
    </ng-template>
  </sl-slotline>`,
})
class PartsHostComponent {
  readonly adapter = adapter();
  readonly picked = signal<BookingSelection>(null);
  readonly fields = [{ name: 'email', label: 'Email', type: 'email' as const }];

  protected submit(event: Event, actions: { submit(): void }): void {
    event.preventDefault();
    actions.submit();
  }
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

async function mount(): Promise<ComponentFixture<PartsHostComponent>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(PartsHostComponent);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

describe('part templates', () => {
  it('renders a replaced slot and still picks through it', async () => {
    const fixture = await mount();

    query(fixture, `[data-day="${DAY}"]`).click();
    await settle(fixture);

    const slot = query(fixture, '.priced-slot');
    expect(slot.querySelector('.price')?.textContent).toBe('€90');
    // The application's own element is used, carrying the prepared classes.
    expect(slot.classList.contains('sl-slot')).toBe(true);
    // Every offer of the day went through the replacement.
    const priced = (fixture.nativeElement as HTMLElement).querySelectorAll('.priced-slot');
    expect(priced.length).toBeGreaterThan(1);
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.priced-slot .price'),
    ).toHaveLength(priced.length);

    slot.click();
    await settle(fixture);

    expect(fixture.componentInstance.picked()?.date).toBe(DAY);
    expect(fixture.componentInstance.picked()?.slot?.start).toBe('2026-05-04T09:15:00.000Z');
  });

  it('replaces the content of a day without losing the grid', async () => {
    const fixture = await mount();

    query(fixture, '[role="grid"]');
    const cell = query(fixture, `[data-day="${DAY}"]`);
    // The button, its role and its keyboard handling still belong to the library.
    expect(cell.getAttribute('role')).toBe('gridcell');
    expect(cell.querySelector('.custom-day')?.textContent).toBe('04');

    cell.focus();
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await settle(fixture);

    const focused = document.activeElement as HTMLElement;
    expect(focused).not.toBe(cell);
    expect(focused.getAttribute('role')).toBe('gridcell');
  });

  it('replaces the form and books with the values it collects', async () => {
    const fixture = await mount();

    query(fixture, `[data-day="${DAY}"]`).click();
    await settle(fixture);
    query(fixture, '.sl-slot').click();
    await settle(fixture);

    const form = query(fixture, '.custom-form');
    const input = form.querySelector('input') as HTMLInputElement;
    input.value = 'ann@example.com';
    input.dispatchEvent(new Event('input'));
    await settle(fixture);

    (form.querySelector('button') as HTMLButtonElement).click();
    await settle(fixture);

    expect(query(fixture, '.custom-confirmation')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.sl-confirmation')).toBeNull();
  });

  it('replaces the confirmation screen', async () => {
    const fixture = await mount();

    query(fixture, `[data-day="${DAY}"]`).click();
    await settle(fixture);
    query(fixture, '.sl-slot').click();
    await settle(fixture);

    const form = query(fixture, '.custom-form');
    const input = form.querySelector('input') as HTMLInputElement;
    input.value = 'ann@example.com';
    input.dispatchEvent(new Event('input'));
    await settle(fixture);
    (form.querySelector('button') as HTMLButtonElement).click();
    await settle(fixture);

    const confirmation = query(fixture, '.custom-confirmation');
    (confirmation.querySelector('button') as HTMLButtonElement).click();
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('.custom-confirmation')).toBeNull();
    expect(query(fixture, '[role="grid"]')).not.toBeNull();
  });
});

/** A host that replaces the calm parts: the header and the recap of the selection. */
@Component({
  selector: 'sl-parts-header-host',
  standalone: true,
  imports: [SlotlineComponent, SlotlinePartDirective],
  template: `<sl-slotline
    [adapter]="adapter"
    timeZone="UTC"
    locale="en"
    minDate="2026-05-04"
    maxDate="2026-05-31"
  >
    <ng-template slSlotlinePart="header" let-header>
      <div class="custom-header">
        <h2>{{ header.title }}</h2>
        <span class="custom-duration">{{ header.durationLabel }}</span>
      </div>
    </ng-template>

    <ng-template slSlotlinePart="summary" let-view>
      <p class="custom-summary">{{ view.time.dateLabel }} at {{ view.time.label }}</p>
    </ng-template>
  </sl-slotline>`,
})
class PartsHeaderHostComponent {
  readonly adapter = adapter();
}

/** An adapter that never answers, so the error part is on screen. */
function failingAdapter(): AvailabilityAdapter {
  return {
    getAvailability: () => Promise.reject(new Error('service is down')),
    getSlots: () => Promise.resolve([]),
  };
}

@Component({
  selector: 'sl-parts-error-host',
  standalone: true,
  imports: [SlotlineComponent, SlotlinePartDirective],
  template: `<sl-slotline
    [adapter]="adapter"
    timeZone="UTC"
    locale="en"
    minDate="2026-05-04"
    maxDate="2026-05-31"
  >
    <ng-template slSlotlinePart="error" let-error let-retry="retry">
      <div class="custom-error">
        <p>{{ error.message }}</p>
        <button type="button" (click)="retry?.()">{{ error.retryLabel }}</button>
      </div>
    </ng-template>
  </sl-slotline>`,
})
class PartsErrorHostComponent {
  readonly adapter = failingAdapter();
}

describe('the remaining parts', () => {
  it('replaces the header while the library keeps the progress bar in place', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(PartsHeaderHostComponent);
    fixture.detectChanges();
    await settle(fixture);

    expect(query(fixture, '.custom-header')).not.toBeNull();
    // The progress stays the library's: it sits right after the replaced block.
    expect(query(fixture, '.sl-progress')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.sl-header-main')).toBeNull();
  });

  it('replaces the recap of the selection', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(PartsHeaderHostComponent);
    fixture.detectChanges();
    await settle(fixture);

    query(fixture, `[data-day="${DAY}"]`).click();
    await settle(fixture);
    query(fixture, '.sl-slot').click();
    await settle(fixture);

    const summary = query(fixture, '.custom-summary');
    expect(summary.textContent).toContain('Monday, May 4');
    expect((fixture.nativeElement as HTMLElement).querySelector('.sl-summary')).toBeNull();
  });

  it('replaces the error block and keeps the retry the library prepared', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(PartsErrorHostComponent);
    fixture.detectChanges();
    await settle(fixture);

    const error = query(fixture, '.custom-error');
    expect(error.querySelector('p')?.textContent?.length).toBeGreaterThan(0);
    // The retry button the application rendered goes through the part's context.
    (error.querySelector('button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(query(fixture, '.custom-error')).not.toBeNull();
  });
});
