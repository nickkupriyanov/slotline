/**
 * The client half of the teaching server: a `BookingAdapter` over HTTP.
 *
 * It is the adapter the examples use when they are pointed at
 * `tools/dev-server/server.mjs`, and it is deliberately explicit about the three
 * things a real integration has to get right:
 *
 *   · every create carries the attempt's `idempotencyKey` as `Idempotency-Key`, and
 *     the adapter advertises how long the server keeps it;
 *   · a classified refusal becomes a `BookingError` with its code and field errors,
 *     while a network failure is left as it is — an unclassified error at creation is
 *     an unknown outcome, and pretending otherwise is what loses bookings;
 *   · `findBooking` is how an application resolves that unknown outcome, through the
 *     same key.
 *
 * Both playgrounds import this file, so they demonstrate one server semantics.
 */
import {
  BookingError,
  type AvailabilityAdapter,
  type BookingAdapter,
  type BookingErrorCode,
  type BookingRequest,
  type BookingResult,
  type BookingSelection,
  type DayAvailability,
  type DefaultBookingValues,
  type TimeSlot,
} from '@nickkupriyanov/slotline-core';

export interface ExampleHttpAdapterOptions {
  /** Where the server listens, for example `http://127.0.0.1:8787`. */
  baseUrl: string;
  /** How long the server keeps an idempotency key. Default: 24 hours. */
  retentionMs?: number;
  /** Ask the server to commit the record and lose the answer, to show the state. */
  dropResponse?: boolean;
  fetch?: typeof globalThis.fetch;
}

export interface ExampleHttpAdapter<TValues = DefaultBookingValues>
  extends BookingAdapter<TValues> {
  /** Looks a created record up by the key of the attempt that asked for it. */
  findBooking(idempotencyKey: string): Promise<BookingResult | null>;
}

const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;

export function createExampleHttpAdapter<TValues = DefaultBookingValues>(
  options: ExampleHttpAdapterOptions,
): ExampleHttpAdapter<TValues> {
  const base = options.baseUrl.replace(/\/$/, '');
  const retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;
  const doFetch = options.fetch ?? globalThis.fetch;

  async function request(path: string, init?: RequestInit): Promise<Response> {
    return doFetch(`${base}${path}`, init);
  }

  /** Turns a classified refusal into the error the widget understands. */
  async function failure(response: Response): Promise<BookingError> {
    let body: {
      code?: BookingErrorCode;
      message?: string;
      fieldErrors?: Record<string, string>;
    } = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }

    return new BookingError({
      code: body.code ?? 'GENERIC_FAILURE',
      message: body.message ?? `The example server answered ${response.status}`,
      ...(body.fieldErrors ? { fieldErrors: body.fieldErrors } : {}),
    });
  }

  const availability: AvailabilityAdapter = {
    async getAvailability(query): Promise<DayAvailability[]> {
      const params = new URLSearchParams({ from: query.from, to: query.to });
      const response = await request(`/api/availability?${params}`, { signal: query.signal });
      if (!response.ok) throw await failure(response);
      return (await response.json()) as DayAvailability[];
    },

    async getSlots(query): Promise<TimeSlot[]> {
      const params = new URLSearchParams({ date: query.date });
      const response = await request(`/api/slots?${params}`, { signal: query.signal });
      if (!response.ok) throw await failure(response);
      return (await response.json()) as TimeSlot[];
    },
  };

  return {
    ...availability,

    capabilities: { idempotentCreate: true, idempotencyRetentionMs: retentionMs },

    async createBooking(request_): Promise<BookingResult> {
      const response = await request('/api/bookings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': request_.idempotencyKey,
          ...(options.dropResponse ? { 'x-example-drop': '1' } : {}),
        },
        body: JSON.stringify({ slotId: request_.slot.id, values: request_.values }),
      });

      if (!response.ok) throw await failure(response);
      return (await response.json()) as BookingResult;
    },

    async findBooking(idempotencyKey: string): Promise<BookingResult | null> {
      const params = new URLSearchParams({ key: idempotencyKey });
      const response = await request(`/api/bookings?${params}`);
      if (response.status === 404) return null;
      if (!response.ok) throw await failure(response);
      return (await response.json()) as BookingResult;
    },
  } as ExampleHttpAdapter<TValues>;
}

/** What a selection-only example needs: no create, no capabilities. */
export function createExampleAvailabilityAdapter(
  options: ExampleHttpAdapterOptions,
): AvailabilityAdapter {
  const adapter = createExampleHttpAdapter(options);
  return {
    getAvailability: (query) => adapter.getAvailability(query),
    getSlots: (query) => adapter.getSlots(query),
  };
}

export type { BookingRequest, BookingSelection };
