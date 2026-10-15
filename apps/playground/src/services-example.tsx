import { useMemo, useState } from 'react';
import {
  Slotline,
  DefaultSlot,
  format,
  type AvailabilityAdapter,
  type BookingRequest,
  type BookingResult,
  type BookingSlotView,
  type DayAvailability,
  type SlotlineComponents,
  type TimeSlot,
} from '@nickkupriyanov/slotline-react';

/**
 * Different services and two resources that share a calendar.
 *
 * The point of the example is the two things an application brings to the widget:
 * a *context* (which service, which resource — passed to every query) and the
 * *data* a slot carries. Everything else is the library's.
 */

interface Service {
  id: string;
  name: string;
  fields: readonly { name: string; label: string; type?: 'tel' | 'textarea'; required?: boolean }[];
  duration: number;
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
  /** How many slots this resource has on a day, so the two calendars differ. */
  busyFrom: number;
}

const RESOURCES: Resource[] = [
  { id: 'ann', name: 'Ann', busyFrom: 10 },
  { id: 'boris', name: 'Boris', busyFrom: 14 },
];

/** Every offer carries what it costs, so a custom card can show it. */
interface OfferData {
  resource: string;
  price: number;
}

/** What the application passes with every query: which service, which resource. */
interface DemoContextData {
  service: string;
  resource: string;
}

const PRICES: Record<string, number> = { ann: 90, boris: 120 };

function isoOf(day: string, hour: number): string {
  return `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`;
}

/** Publishes weekdays 09:00 to 17:00 in hourly steps, minus what the resource blocks. */
function serviceAdapter(): AvailabilityAdapter<DemoContextData, OfferData> {
  const horizon = (from: string, to: string): string[] => {
    const days: string[] = [];
    const cursor = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      const weekday = cursor.getUTCDay();
      if (weekday !== 0 && weekday !== 6) days.push(key);
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

/** The same request shape every example uses; the server work is the adapter's. */
function createBooking(request: BookingRequest): Promise<BookingResult> {
  return Promise.resolve({
    id: `demo_${request.slot.id}`,
    status: 'confirmed',
    location: request.context.key === 'phone' ? 'Phone call' : 'Studio 2',
    instructions: request.context.key === 'phone' ? 'We call you.' : 'Ring the bell twice.',
  });
}

export function ServicesExample() {
  const adapter = useMemo(() => {
    const availability = serviceAdapter();
    // The selection example never creates anything, so a booking adapter is only
    // needed when the widget is allowed to book.
    return {
      ...availability,
      createBooking,
      capabilities: { idempotentCreate: true, idempotencyRetentionMs: 60_000 },
    };
  }, []);

  const [service, setService] = useState<Service>(SERVICES[0]!);
  const [resource, setResource] = useState<Resource>(RESOURCES[0]!);
  const [booked, setBooked] = useState<string | null>(null);

  // A custom card: the prepared props keep the pick, the state and the naming, and
  // the price comes from the slot's own data.
  const components: SlotlineComponents = useMemo(
    () => ({
      Slot: ({ slot, index, slotProps, children }) => {
        // The slot view carries the application's own data untouched; the example
        // knows what it put there.
        const data = slot.data as OfferData | undefined;
        return (
          <DefaultSlot slot={slot} index={index} slotProps={slotProps}>
            {children}
            {data ? (
              <span className="offer__price">{format('€{amount}', { amount: data.price })}</span>
            ) : null}
          </DefaultSlot>
        );
      },
    }),
    [],
  );

  const onBooked = (result: BookingResult, request: BookingRequest): void => {
    const values = request.values as Record<string, unknown>;
    setBooked(`${result.id} · ${String(values.name ?? values.phone ?? '')}`);
  };

  return (
    <section className="services" aria-labelledby="services-title">
      <h2 id="services-title">Services and resources</h2>
      <p className="services__hint">
        The context travels with every query, so the same widget books a different service and a
        different person. The offers carry their own data, which is what the card shows.
      </p>

      <div className="services__controls">
        <label className="services__field">
          Service
          <select
            value={service.id}
            onChange={(event) => {
              const next = SERVICES.find((item) => item.id === event.target.value);
              if (next) {
                setService(next);
                setBooked(null);
              }
            }}
          >
            {SERVICES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className="services__field">
          Resource
          <select
            value={resource.id}
            onChange={(event) => {
              const next = RESOURCES.find((item) => item.id === event.target.value);
              if (next) {
                setResource(next);
                setBooked(null);
              }
            }}
          >
            {RESOURCES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="services__pair">
        {RESOURCES.map((item) => (
          <div key={item.id} className="services__widget">
            <p className="services__caption">
              {service.name} with {item.name}
            </p>
            <Slotline
              adapter={adapter}
              context={{ key: service.id, data: { service: service.id, resource: item.id } }}
              fields={service.fields}
              duration={service.duration}
              locale="en"
              timeZone="UTC"
              components={components}
              onBooked={onBooked}
            />
          </div>
        ))}
      </div>

      {booked ? (
        <p className="services__result" role="status">
          Booked {booked}
        </p>
      ) : null}
    </section>
  );
}
