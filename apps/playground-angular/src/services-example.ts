import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  format,
  type AvailabilityAdapter,
  type BookingRequest,
  type BookingResult,
  type DayAvailability,
  type TimeSlot,
} from '@nickkupriyanov/slotline-core';
import {
  SlotlineComponent,
  SlotlinePartDirective,
  type SlotlinePartContexts,
} from '@nickkupriyanov/slotline-angular';

/**
 * Different services and two resources that share a calendar.
 *
 * The context travels with every query, so one widget books any service with any
 * person; the offers carry their own data, and the slot template is what shows it.
 */

interface Service {
  id: string;
  name: string;
  duration: number;
  fields: readonly {
    name: string;
    label: string;
    type?: 'tel' | 'textarea';
    required?: boolean;
  }[];
}

const SERVICES: Service[] = [
  {
    id: 'intro',
    name: 'Intro call',
    duration: 30,
    fields: [
      { name: 'name', label: 'Your name', required: true },
      { name: 'email', label: 'Email', required: true },
    ],
  },
  {
    id: 'phone',
    name: 'Phone consultation',
    duration: 20,
    fields: [
      { name: 'name', label: 'Your name', required: true },
      { name: 'phone', label: 'Phone', type: 'tel', required: true },
      { name: 'question', label: 'What should we prepare?', type: 'textarea' },
    ],
  },
];

interface Resource {
  id: string;
  name: string;
  /** The hour this resource stops taking offers, so the two calendars differ. */
  busyFrom: number;
}

const RESOURCES: Resource[] = [
  { id: 'ann', name: 'Ann', busyFrom: 10 },
  { id: 'boris', name: 'Boris', busyFrom: 14 },
];

const PRICES: Record<string, number> = { ann: 90, boris: 120 };

/** Every offer carries what it costs, which is what the custom card renders. */
interface OfferData {
  resource: string;
  price: number;
}

interface DemoContextData {
  service: string;
  resource: string;
}

function isoOf(day: string, hour: number): string {
  return `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`;
}

function serviceAdapter(): AvailabilityAdapter<DemoContextData, OfferData> {
  const horizon = (from: string, to: string): string[] => {
    const days: string[] = [];
    const cursor = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    while (cursor <= end) {
      const weekday = cursor.getUTCDay();
      if (weekday !== 0 && weekday !== 6) days.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
  };

  const resourceOf = (context: { data?: DemoContextData }): Resource =>
    RESOURCES.find((resource) => resource.id === context.data?.resource) ?? RESOURCES[0]!;

  return {
    async getAvailability(query): Promise<DayAvailability<OfferData>[]> {
      const resource = resourceOf(query.context);
      return horizon(query.from, query.to).map((date) => ({
        date,
        slotCount: Math.max(0, resource.busyFrom - 9),
      }));
    },
    async getSlots(query): Promise<TimeSlot<OfferData>[]> {
      const resource = resourceOf(query.context);
      const slots: TimeSlot<OfferData>[] = [];
      for (let hour = 9; hour < resource.busyFrom; hour += 1) {
        slots.push({
          id: `${resource.id}-${query.date}#${hour}`,
          start: isoOf(query.date, hour),
          data: { resource: resource.id, price: PRICES[resource.id] ?? 100 },
        });
      }
      return slots;
    },
  };
}

@Component({
  selector: 'app-services-example',
  imports: [SlotlineComponent, SlotlinePartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="services">
      <h2>Services and resources</h2>
      <p class="services__hint">
        The context travels with every query, so the same widget books a different service and a
        different person. Each offer carries its own price, which the slot template renders.
      </p>

      <div class="services__controls">
        <label class="services__field">
          Service
          <select [value]="service().id" (change)="chooseService($event)">
            @for (item of services; track item.id) {
              <option [value]="item.id">{{ item.name }}</option>
            }
          </select>
        </label>

        <label class="services__field">
          Resource
          <select [value]="resource().id" (change)="chooseResource($event)">
            @for (item of resources; track item.id) {
              <option [value]="item.id">{{ item.name }}</option>
            }
          </select>
        </label>
      </div>

      <div class="services__pair">
        @for (item of resources; track item.id) {
          <div class="services__widget">
            <p class="services__caption">{{ service().name }} with {{ item.name }}</p>
            <sl-slotline
              [adapter]="adapter"
              [context]="{ key: service().id, data: contextFor(item) }"
              [fields]="service().fields"
              [duration]="service().duration"
              locale="en"
              timeZone="UTC"
              (booked)="onBooked($event)"
            >
              <ng-template
                slSlotlinePart="slot"
                let-slot
                let-index="index"
                let-slotProps="slotProps"
              >
                <button
                  type="button"
                  [class]="slotProps.className"
                  [attr.aria-current]="slotProps['aria-current']"
                  [attr.aria-label]="slotProps['aria-label'] ?? slot.label"
                  (click)="slotProps.onClick()"
                >
                  {{ slot.label }}
                  <span class="offer__price">{{ priceOf(slot) }}</span>
                </button>
              </ng-template>
            </sl-slotline>
          </div>
        }
      </div>

      @if (booked(); as booked) {
        <p class="services__result" role="status">Booked {{ booked }}</p>
      }
    </section>
  `,
})
export class ServicesExample {
  readonly services = SERVICES;
  readonly resources = RESOURCES;

  readonly service = signal(SERVICES[0]!);
  /** Kept so the caption and the selects agree on what is chosen. */
  readonly resource = signal(RESOURCES[0]!);
  readonly booked = signal<string | null>(null);

  readonly adapter: AvailabilityAdapter<DemoContextData, OfferData> = {
    ...serviceAdapter(),
    // The examples book for real, so the same adapter creates records.
    async createBooking(request: BookingRequest): Promise<BookingResult> {
      return {
        id: `demo_${request.slot.id}`,
        status: 'confirmed',
        location: request.context.key === 'phone' ? 'Phone call' : 'Studio 2',
        instructions: request.context.key === 'phone' ? 'We call you.' : 'Ring the bell twice.',
      };
    },
  } as AvailabilityAdapter<DemoContextData, OfferData>;

  /** Which service and which resource every query carries. */
  readonly contextFor = (item: Resource): DemoContextData => ({
    service: this.service().id,
    resource: item.id,
  });

  protected priceOf(slot: SlotlinePartContexts['slot']['$implicit']): string {
    const data = slot.data as OfferData | undefined;
    return data ? format('€{amount}', { amount: data.price }) : '';
  }

  protected chooseService(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    const next = SERVICES.find((item) => item.id === id);
    if (next) {
      this.service.set(next);
      this.booked.set(null);
    }
  }

  protected chooseResource(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    const next = RESOURCES.find((item) => item.id === id);
    if (next) {
      this.resource.set(next);
      this.booked.set(null);
    }
  }

  protected onBooked(event: { result: BookingResult; request: BookingRequest }): void {
    const values = event.request.values as Record<string, unknown>;
    this.booked.set(`${event.result.id} · ${String(values['name'] ?? values['phone'] ?? '')}`);
  }
}
