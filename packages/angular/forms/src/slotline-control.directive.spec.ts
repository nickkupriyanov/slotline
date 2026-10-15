import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import {
  createMockAdapter,
  type AvailabilityAdapter,
  type BookingSelection,
} from '@nickkupriyanov/slotline-core';
import { SlotlineComponent } from '@nickkupriyanov/slotline-angular';
import { SlotlineControlDirective } from './slotline-control.directive';

const NOW = Date.parse('2026-05-04T09:00:00Z');
const DAY = '2026-05-04';

/** Availability only, and a calendar pinned to one Monday. */
function availabilityOf(): AvailabilityAdapter {
  const mock = createMockAdapter({
    latency: 0,
    horizonDays: 40,
    timeZone: 'UTC',
    busyRatio: 0,
    now: () => NOW,
  });

  return {
    getAvailability: (query) => mock.getAvailability(query),
    getSlots: (query) => mock.getSlots(query),
  };
}

/**
 * The widget as a field of a real reactive form: no `selection` binding, no
 * `selectionChange` handler — the directive is the only bridge.
 */
@Component({
  selector: 'sl-form-host',
  standalone: true,
  imports: [ReactiveFormsModule, SlotlineComponent, SlotlineControlDirective],
  template: `<form [formGroup]="form">
    <sl-slotline
      mode="selection"
      formControlName="slot"
      [adapter]="adapter"
      timeZone="UTC"
      locale="en"
      minDate="2026-05-04"
      maxDate="2026-05-31"
    />
  </form>`,
})
class FormHostComponent {
  readonly adapter = availabilityOf();
  readonly form = new FormGroup({ slot: new FormControl<BookingSelection>(null) });
}

function mount(): ComponentFixture<FormHostComponent> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(FormHostComponent);
  fixture.detectChanges();
  return fixture;
}

/** Lets change detection settle and drains the controller's promise chain. */
async function settle(fixture: ComponentFixture<FormHostComponent>): Promise<void> {
  fixture.detectChanges();
  for (let tick = 0; tick < 25; tick += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function queried(fixture: ComponentFixture<FormHostComponent>, selector: string): HTMLElement {
  const element = (fixture.nativeElement as HTMLElement).querySelector(
    selector,
  ) as HTMLElement | null;
  if (!element) throw new Error(`expected to find ${selector}`);
  return element;
}

function cell(fixture: ComponentFixture<FormHostComponent>): HTMLElement {
  return queried(fixture, `[data-day="${DAY}"]`);
}

describe('SlotlineControlDirective', () => {
  it('reports what the user picked as the form value', async () => {
    const fixture = mount();
    await settle(fixture);

    cell(fixture).click();
    await settle(fixture);

    const offer = queried(fixture, '.sl-slot');
    offer.click();
    await settle(fixture);

    const value = fixture.componentInstance.form.controls.slot.value;
    expect(value?.date).toBe(DAY);
    expect(value?.slot?.start).toBe('2026-05-04T09:15:00.000Z');
    // A pick is a touch, which is what a form needs to show its own errors.
    expect(fixture.componentInstance.form.controls.slot.touched).toBe(true);
  });

  it('shows the value the form writes', async () => {
    const fixture = mount();
    await settle(fixture);

    fixture.componentInstance.form.controls.slot.setValue({
      date: DAY,
      slot: { id: `${DAY}#0555`, start: '2026-05-04T09:15:00.000Z' },
    });
    await settle(fixture);

    // The value names a day and an offer, so the widget opens on that offer and
    // shows it as the form's choice.
    expect(queried(fixture, '.sl-slot.is-selected')).not.toBeNull();
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('.sl-root')
        ?.getAttribute('data-sl-step'),
    ).toBe('time');
    expect((fixture.nativeElement as HTMLElement).querySelector('.sl-submit')).toBeNull();
  });

  it('follows the form disabled state', async () => {
    const fixture = mount();
    await settle(fixture);
    const root = (): Element | null =>
      (fixture.nativeElement as HTMLElement).querySelector('.sl-root');

    expect(root()?.getAttribute('data-sl-disabled')).toBeNull();

    fixture.componentInstance.form.controls.slot.disable();
    await settle(fixture);
    expect(root()?.getAttribute('data-sl-disabled')).toBe('true');
    expect(root()?.getAttribute('aria-disabled')).toBe('true');

    fixture.componentInstance.form.controls.slot.enable();
    await settle(fixture);
    expect(root()?.getAttribute('data-sl-disabled')).toBeNull();
  });
});
