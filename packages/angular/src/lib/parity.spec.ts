import { Component, output, provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SLOT_CLASS, createMockAdapter, type BookingAdapter } from '@nickkupriyanov/slotline-core';
import { parityCases, type ParityHarness } from '../../../../tools/parity/scenarios';
import { SlotlineComponent } from './slotline.component';
import type { BookedEvent } from './types';

/** Mounts the widget the way an application does, with the same inputs as React. */
@Component({
  selector: 'sl-parity-host',
  standalone: true,
  imports: [SlotlineComponent],
  template: `<sl-slotline
    [adapter]="adapter"
    timeZone="UTC"
    locale="en"
    (booked)="booked.emit($event)"
  />`,
})
class ParityHostComponent {
  readonly adapter: BookingAdapter = createMockAdapter({
    latency: 0,
    horizonDays: 40,
    timeZone: 'UTC',
    busyRatio: 0,
  });
  readonly booked = output<BookedEvent>();
}

/**
 * The Angular side of the parity suite.
 *
 * Same harness, same scenarios, same expectations as the React suite; only the way
 * the widget is mounted and driven differs.
 */
class AngularParityHarness implements ParityHarness {
  private fixture: ComponentFixture<ParityHostComponent> | null = null;
  private readonly requests: Array<{ date: string; email: string; idempotencyKey: string }> = [];
  private selected: string | null = null;

  private get host(): ComponentFixture<ParityHostComponent> {
    if (!this.fixture) throw new Error('render() has not run yet');
    return this.fixture;
  }

  /**
   * Lets change detection settle *and* drains the controller's loader, which is a
   * plain promise chain: `whenStable` alone does not spin the queue that far.
   */
  private async settle(): Promise<void> {
    const fixture = this.host;
    fixture.detectChanges();
    for (let tick = 0; tick < 25; tick += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async render(): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(ParityHostComponent);
    this.fixture = fixture;
    fixture.componentInstance.booked.subscribe((event) => {
      this.requests.push({
        date: event.request.date,
        email: String(event.request.values.email ?? ''),
        idempotencyKey: event.request.idempotencyKey,
      });
    });
    fixture.detectChanges();
    await this.settle();
    if (this.bookableCells().length === 0) {
      throw new Error('the widget never received availability');
    }
  }

  private cells(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('[role="gridcell"]'));
  }

  private bookableCells(): HTMLElement[] {
    return this.cells().filter((cell) => cell.getAttribute('aria-disabled') !== 'true');
  }

  async pickFirstBookableDay(): Promise<void> {
    const cell = this.bookableCells()[0];
    if (!cell) throw new Error('no bookable day in the grid');
    this.selected = cell.getAttribute('data-day');
    cell.click();
    await this.settle();
  }

  async pickFirstOffer(): Promise<void> {
    const offer = document.querySelector<HTMLElement>(`.${SLOT_CLASS.slot}`);
    if (!offer) throw new Error('no offer to pick');
    offer.click();
    await this.settle();
  }

  async type(label: string, value: string): Promise<void> {
    const control = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
    if (!control) throw new Error(`no control labelled "${label}"`);
    control.value = value;
    control.dispatchEvent(new Event('input'));
    await this.settle();
  }

  async submit(): Promise<void> {
    const button = document.querySelector<HTMLButtonElement>(`.${SLOT_CLASS.submit}`);
    if (!button) throw new Error('no submit button');
    button.click();
    await this.settle();
  }

  async goBack(): Promise<void> {
    const button = document.querySelector<HTMLButtonElement>('.sl-icon-button');
    if (!button) throw new Error('no back affordance');
    button.click();
    await this.settle();
  }

  async selectDuration(index: number): Promise<void> {
    const pill = Array.from(
      document.querySelectorAll<HTMLElement>('[role="radiogroup"] [role="radio"]'),
    )[index];
    if (!pill) throw new Error(`no duration option at ${index}`);
    pill.click();
    await this.settle();
  }

  selectedDay(): string | null {
    return this.selected;
  }

  booked(): { date: string; email: string; idempotencyKey: string } | null {
    return this.requests[0] ?? null;
  }

  readonly obs: ParityHarness['obs'] = {
    step: () => this.attr(`.${SLOT_CLASS.root}`, 'data-sl-step'),
    title: () => this.text(`.${SLOT_CLASS.title}`),
    durationBadge: () => this.text(`.${SLOT_CLASS.badge}`),
    gridCells: () => this.cells().length,
    bookableDays: () => this.bookableCells().length,
    offers: () => document.querySelectorAll(`.${SLOT_CLASS.slot}`).length,
    liveMessage: () => this.text('[role="status"]'),
    formErrors: () => document.querySelectorAll('[role="alert"]').length,
    errorText: () =>
      Array.from(document.querySelectorAll('[role="alert"]'))
        .map((alert) => alert.textContent ?? '')
        .join(' '),
    confirmationTitle: () => this.text(`.${SLOT_CLASS.confirmationTitle}`),
    checkedDuration: () => this.text('[role="radiogroup"] [role="radio"][aria-checked="true"]'),
  };

  private attr(selector: string, name: string): string {
    return document.querySelector(selector)?.getAttribute(name) ?? '';
  }

  private text(selector: string): string {
    return document.querySelector(selector)?.textContent?.trim() ?? '';
  }
}

describe('parity with the shared scenarios', () => {
  for (const scenario of parityCases) {
    it(scenario.name, async () => {
      const harness = new AngularParityHarness();
      await expect(scenario.run(harness)).resolves.toEqual(scenario.expected);
    });
  }
});
