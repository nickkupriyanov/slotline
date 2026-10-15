import { ChangeDetectionStrategy, Component, effect, input, viewChild } from '@angular/core';
import {
  SlotlineComponent,
  type BookingAdapter,
  type SlotlineTheme,
} from '@nickkupriyanov/slotline-angular';

/** The screens the gallery shows. */
export type GalleryTarget = 'date' | 'time' | 'details' | 'attempt' | 'confirmed';

/**
 * One panel of the state gallery.
 *
 * It renders the real widget and drives it to `target` through the controller's own
 * actions — the same ones a user's clicks reach — so every panel shows genuine
 * output rather than a mock-up, and the driver exercises the public API a consumer
 * would use to build a guided tour.
 */
@Component({
  selector: 'app-gallery-panel',
  imports: [SlotlineComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="panel">
      <figcaption>{{ caption() }}</figcaption>
      <sl-slotline [adapter]="adapter()" [theme]="theme()" [locale]="locale()" timeZone="UTC" />
    </figure>
  `,
})
export class GalleryPanel {
  readonly adapter = input.required<BookingAdapter>();
  readonly target = input.required<GalleryTarget>();
  readonly caption = input('');
  readonly theme = input<SlotlineTheme>('dark');
  readonly locale = input('en');

  private readonly widget = viewChild(SlotlineComponent);

  constructor() {
    effect(() => {
      const target = this.target();
      const widget = this.widget();
      if (!widget) return;

      const view = widget.service.view();
      if (!view || view.step === target) return;

      const actions = widget.service.actions;

      if (view.step === 'date') {
        const day = view.month.grid.find((candidate) => view.days[candidate]?.bookable);
        if (day) actions.selectDate(day);
        return;
      }

      if (view.step === 'time') {
        const slot = view.slots.items[0];
        if (slot) actions.selectSlot(slot);
        return;
      }

      if (view.step === 'details') {
        if (!view.form.values.name || !view.form.values.email) {
          actions.setValues({ name: 'Ann Example', email: 'ann@example.com' });
          return;
        }
        if (target !== 'details') void actions.submit();
      }
    });
  }
}

/** The gallery: every screen of the flow, side by side. */
@Component({
  selector: 'app-gallery',
  imports: [GalleryPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gallery">
      @for (panel of panels; track panel.target) {
        <app-gallery-panel
          [adapter]="panel.target === 'attempt' ? unknownAdapter() : adapter()"
          [target]="panel.target"
          [caption]="panel.caption"
          [theme]="theme()"
          [locale]="locale()"
        />
      }
    </div>
  `,
})
export class Gallery {
  readonly adapter = input.required<BookingAdapter>();
  readonly unknownAdapter = input.required<BookingAdapter>();
  readonly theme = input<SlotlineTheme>('dark');
  readonly locale = input('en');

  readonly panels: Array<{ target: GalleryTarget; caption: string }> = [
    { target: 'date', caption: '1 · calendar' },
    { target: 'time', caption: '2 · offers' },
    { target: 'details', caption: '3 · details' },
    { target: 'attempt', caption: '4 · unknown outcome' },
    { target: 'confirmed', caption: '5 · booked' },
  ];
}
