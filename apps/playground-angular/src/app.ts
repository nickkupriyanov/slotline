import { ChangeDetectionStrategy, Component, computed, signal, viewChild } from '@angular/core';
import {
  SlotlineComponent,
  type BookingAdapter,
  type BookedEvent,
  type FailedEvent,
  type SlotlineTheme,
} from '@nickkupriyanov/slotline-angular';
import { adapter as mockAdapter, unknownOutcomeAdapter } from './adapter';
import { createExampleHttpAdapter } from '@slotline/example-server';
import { EXAMPLE_SERVER_URL, serverAdapter } from './server-adapter';
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
    <main
      class="page"
      [attr.data-source]="useServer() ? 'server' : 'mock'"
      [attr.data-drop]="dropAnswer() ? '1' : '0'"
    >
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

        <label class="control">
          Data
          <select [value]="useServer() ? 'server' : 'mock'" (change)="onDataSource($event)">
            <option value="mock">built-in mock</option>
            <option value="server">teaching server</option>
          </select>
        </label>

        @if (useServer()) {
          <label class="control control--check">
            <input type="checkbox" [checked]="dropAnswer()" (change)="onDropAnswer($event)" />
            Lose the answer
          </label>
        }
      </header>

      @if (useServer()) {
        <p class="server-hint">
          Talking to <code>{{ serverUrl }}</code
          >. Start it with <code>node tools/dev-server/server.mjs</code>. With “Lose the answer” on,
          the record is created and the reply never arrives — press “Check booking status” and the
          widget resolves it through the key of the attempt.
        </p>
      }

      @if (gallery()) {
        <app-gallery
          [adapter]="adapter()"
          [unknownAdapter]="unknownOutcomeAdapter"
          [theme]="theme()"
          [locale]="locale()"
        />
      } @else {
        <sl-slotline
          #widget
          [adapter]="adapter()"
          [theme]="theme()"
          [locale]="locale()"
          [timeZone]="timeZone()"
          [layout]="layout()"
          [showTimeZoneSelector]="true"
          [showTimeFormatSelector]="true"
          [timeZones]="zones"
          (timeZoneChange)="onTimeZoneChange($event)"
          (booked)="onBooked($event)"
          (failed)="onFailed($event)"
          (checkStatus)="onCheckStatus()"
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
  /** The widget on the live tab, so the playground can resolve an attempt itself. */
  private readonly widget = viewChild<SlotlineComponent>('widget');

  readonly serverUrl = EXAMPLE_SERVER_URL;

  /** `?layout=adaptive` opens the playground in the two-column layout. */
  readonly layout = signal<'compact' | 'adaptive'>(
    typeof location !== 'undefined' &&
      new URLSearchParams(location.search).get('layout') === 'adaptive'
      ? 'adaptive'
      : 'compact',
  );

  /** `?data=server&drop=1` opens the playground on the teaching server. */
  private readonly query =
    typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
  readonly useServer = signal(this.query.get('data') === 'server');
  /** Ask the server to commit the record and lose the answer. */
  readonly dropAnswer = signal(this.query.get('drop') === '1');

  /**
   * The built-in mock by default, so the examples work from a static build; the
   * teaching server when it is running.
   */
  readonly adapter = computed<BookingAdapter>(() =>
    this.useServer() ? serverAdapter(this.dropAnswer()) : (mockAdapter as BookingAdapter),
  );

  /** The key of the attempt whose outcome the server never reported. */
  private unresolvedKey: string | null = null;
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

  /** The built-in selector reports where it wants to go; the application owns the value. */
  protected onTimeZoneChange(event: { timeZone: string }): void {
    this.timeZone.set(event.timeZone);
    this.append(`time zone ${event.timeZone}`);
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

  protected onDataSource(event: Event): void {
    this.useServer.set((event.target as HTMLSelectElement).value === 'server');
    this.unresolvedKey = null;
    this.append('switched the data source');
  }

  protected onDropAnswer(event: Event): void {
    this.dropAnswer.set((event.target as HTMLInputElement).checked);
    this.append('the next attempt will lose its answer');
  }

  /**
   * The application looks the attempt up with its own key and hands the outcome back.
   *
   * This is the whole point of the teaching server: the record exists, the reply was
   * lost, and only the key can tell the difference between "created" and "not".
   */
  protected async onCheckStatus(): Promise<void> {
    const key = this.unresolvedKey;
    if (!key) {
      this.append('no unresolved attempt to check');
      return;
    }

    const result = await createExampleHttpAdapter({
      baseUrl: this.serverUrl,
    }).findBooking(key);

    const actions = this.widget()?.service.actions;
    if (result) {
      actions?.resolveAttempt({ idempotencyKey: key, outcome: { status: 'created', result } });
      this.append(`resolved ${key}: the record was created`);
      this.unresolvedKey = null;
      return;
    }

    actions?.resolveAttempt({ idempotencyKey: key, outcome: { status: 'not_created' } });
    this.append(`resolved ${key}: nothing was created`);
    this.unresolvedKey = null;
  }

  protected onFailed(event: FailedEvent): void {
    if (event.context.outcome === 'unknown' && event.context.request) {
      // Remembered so the check below can ask the server about this exact attempt.
      this.unresolvedKey = event.context.request.idempotencyKey;
    }
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
