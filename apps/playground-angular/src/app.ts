import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  SlotlineComponent,
  type BookingAdapter,
  type BookedEvent,
  type FailedEvent,
  type SlotlineTheme,
} from '@nickkupriyanov/slotline-angular';
import { adapter as mockAdapter, unknownOutcomeAdapter } from './adapter';
import { FormExample } from './form-example';
import { ServicesExample } from './services-example';
import { Gallery } from './gallery';

/**
 * The playground shell: the real widget, plus the controls an application owns —
 * theme, locale and zone — and a small log of what the widget reported back.
 */
@Component({
  selector: 'app-root',
  imports: [SlotlineComponent, Gallery, FormExample, ServicesExample],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <header class="toolbar">
        <h1>Slotline · Angular</h1>

        <label class="control">
          Theme
          <select [value]="theme()" (change)="onTheme($event)">
            <option value="dark">dark</option>
            <option value="light">light</option>
            <option value="system">system</option>
          </select>
        </label>

        <label class="control">
          View
          <select [value]="gallery() ? 'gallery' : 'live'" (change)="onView($event)">
            <option value="live">live</option>
            <option value="gallery">gallery</option>
          </select>
        </label>

        <label class="control">
          Locale
          <select [value]="locale()" (change)="onLocale($event)">
            <option value="en">en</option>
            <option value="ru">ru</option>
          </select>
        </label>

        <label class="control">
          Zone
          <select [value]="timeZone()" (change)="onTimeZone($event)">
            @for (zone of zones; track zone) {
              <option [value]="zone">{{ zone }}</option>
            }
          </select>
        </label>
      </header>

      @if (gallery()) {
        <app-gallery
          [adapter]="adapter"
          [unknownAdapter]="unknownOutcomeAdapter"
          [theme]="theme()"
          [locale]="locale()"
        />
      } @else {
        <sl-slotline
          [adapter]="adapter"
          [theme]="theme()"
          [locale]="locale()"
          [timeZone]="timeZone()"
          (booked)="onBooked($event)"
          (failed)="onFailed($event)"
        />
      }

      @if (!gallery()) {
        <app-form-example />
        <app-services-example />
      }

      <section class="log">
        <h2>Events</h2>
        @for (entry of log(); track $index) {
          <p>{{ entry }}</p>
        } @empty {
          <p class="muted">Nothing yet — book a slot.</p>
        }
      </section>
    </main>
  `,
})
export class App {
  readonly adapter: BookingAdapter = mockAdapter;
  readonly unknownOutcomeAdapter = unknownOutcomeAdapter;
  readonly gallery = signal(false);
  readonly theme = signal<SlotlineTheme>('dark');
  readonly locale = signal('en');
  readonly timeZone = signal('UTC');
  readonly zones = ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo'];
  readonly log = signal<string[]>([]);

  constructor() {
    // The gallery is the same application, reachable by URL so a check can open it
    // directly: `?view=gallery`.
    if (typeof window !== 'undefined') {
      this.gallery.set(new URLSearchParams(window.location.search).get('view') === 'gallery');
    }
  }

  protected onView(event: Event): void {
    this.gallery.set(this.value(event) === 'gallery');
  }

  protected onTheme(event: Event): void {
    this.theme.set(this.value(event) as SlotlineTheme);
  }

  protected onLocale(event: Event): void {
    this.locale.set(this.value(event));
  }

  protected onTimeZone(event: Event): void {
    this.timeZone.set(this.value(event));
  }

  protected onBooked(event: BookedEvent): void {
    this.append(`booked ${event.result.id} · ${event.request.date} · ${this.emailOf(event)}`);
  }

  protected onFailed(event: FailedEvent): void {
    this.append(`failed ${event.error.code}: ${event.error.message}`);
  }

  private emailOf(event: BookedEvent): string {
    return String(event.request.values.email ?? '');
  }

  private value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  private append(entry: string): void {
    this.log.update((entries) => [entry, ...entries].slice(0, 8));
  }
}
