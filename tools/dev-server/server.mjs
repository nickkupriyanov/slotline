#!/usr/bin/env node
/**
 * A small teaching server for the Slotline examples.
 *
 * It exists to show the semantics the widget expects, not to be a backend:
 *
 *   GET  /api/availability?from&to&duration   days and how many offers they have
 *   GET  /api/slots?date&duration             the offers of one day
 *   POST /api/bookings                        create a record, idempotently
 *   GET  /api/bookings?key=<idempotencyKey>   look a record up by its attempt
 *   GET  /api/health                          is the example server running
 *
 * Two behaviours are the point of the exercise:
 *
 *   · `Idempotency-Key` is required, and a repeat of the same key returns the same
 *     record instead of creating a second one. The key is kept for as long as the
 *     adapter advertises (`idempotencyRetentionMs`), which is what makes a safe
 *     retry safe.
 *   · `X-Example-Drop: 1` commits the record and then drops the connection. The
 *     client cannot tell whether the booking exists — the state the widget calls an
 *     unknown outcome — and `GET /api/bookings?key=` is how the application finds
 *     out. Nothing is configured to be flaky.
 *
 * Everything lives in memory: no database, no Google Calendar, no OAuth.
 *
 *   node tools/dev-server/server.mjs --port 8787
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** How long a created record can be found by its idempotency key. */
export const RETENTION_MS = 24 * 60 * 60 * 1000;

const OPEN_HOUR = 9;
const CLOSE_HOUR = 17;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const dayKeyOf = (date) => date.toISOString().slice(0, 10);
const instantOf = (day, hour) => `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`;

function daysBetween(from, to) {
  const days = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return days;
  while (cursor <= end && days.length < 400) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(dayKeyOf(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function offersOf(day, taken) {
  const offers = [];
  for (let hour = OPEN_HOUR; hour < CLOSE_HOUR; hour += 1) {
    const id = `${day}#${String(hour).padStart(2, '0')}`;
    if (!taken.has(id)) offers.push({ id, start: instantOf(day, hour) });
  }
  return offers;
}

/**
 * The server, its in-memory state, and nothing else.
 *
 * `now` and `dropResponses` are injectable so a test can control time and simulate the
 * lost answer without a network fault.
 */
export function createExampleServer(options = {}) {
  const now = options.now ?? (() => Date.now());
  const dropResponses = options.dropResponses ?? (() => false);

  /** idempotency key → created record. */
  const byKey = new Map();
  /** slot id → booking id, so a second booking of the same offer is a conflict. */
  const takenSlots = new Map();

  function json(response, status, body) {
    const payload = JSON.stringify(body);
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, idempotency-key, x-example-drop',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    });
    response.end(payload);
  }

  async function readBody(request) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (chunks.length === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return null;
    }
  }

  function bookingOf(id) {
    return [...byKey.values()].find((record) => record.id === id) ?? null;
  }

  class NotFound {}

  const handler = async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, idempotency-key, x-example-drop',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
      });
      response.end();
      return;
    }

    if (url.pathname === '/api/health') {
      json(response, 200, { ok: true, retentionMs: RETENTION_MS });
      return;
    }

    if (url.pathname === '/api/availability' && request.method === 'GET') {
      const from = url.searchParams.get('from') ?? '';
      const to = url.searchParams.get('to') ?? from;
      if (!ISO_DAY.test(from) || !ISO_DAY.test(to)) {
        json(response, 400, {
          code: 'ADAPTER_CONTRACT_VIOLATION',
          message: 'from and to must be YYYY-MM-DD',
        });
        return;
      }
      const taken = new Set(takenSlots.keys());
      json(
        response,
        200,
        daysBetween(from, to).map((date) => ({
          date,
          slotCount: offersOf(date, taken).length,
        })),
      );
      return;
    }

    if (url.pathname === '/api/slots' && request.method === 'GET') {
      const date = url.searchParams.get('date') ?? '';
      if (!ISO_DAY.test(date)) {
        json(response, 400, {
          code: 'ADAPTER_CONTRACT_VIOLATION',
          message: 'date must be YYYY-MM-DD',
        });
        return;
      }
      json(response, 200, offersOf(date, new Set(takenSlots.keys())));
      return;
    }

    if (url.pathname === '/api/bookings' && request.method === 'GET') {
      const key = url.searchParams.get('key') ?? '';
      const record = byKey.get(key);
      // A record is only handed back while the key it was created with is retained.
      if (!record || now() - record.createdAt > RETENTION_MS) {
        json(response, 404, { code: 'GENERIC_FAILURE', message: 'unknown idempotency key' });
        return;
      }
      json(response, 200, record);
      return;
    }

    if (url.pathname === '/api/bookings' && request.method === 'POST') {
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string' || key.length === 0) {
        json(response, 400, {
          code: 'ADAPTER_CONTRACT_VIOLATION',
          message: 'the Idempotency-Key header is required',
        });
        return;
      }

      const body = await readBody(request);
      if (!body || typeof body.slotId !== 'string') {
        json(response, 400, { code: 'ADAPTER_CONTRACT_VIOLATION', message: 'slotId is required' });
        return;
      }

      const existing = byKey.get(key) ?? null;
      if (existing) {
        // The whole point: a repeat of the same attempt returns the same record.
        json(response, 200, existing);
        return;
      }

      const values = body.values ?? {};
      const email = typeof values.email === 'string' ? values.email.trim() : '';
      if (email.length === 0 || !email.includes('@')) {
        json(response, 422, {
          code: 'VALIDATION_FAILED',
          message: 'Check the details',
          fieldErrors: { email: 'A working email is needed for the invite' },
        });
        return;
      }

      const holder = takenSlots.get(body.slotId);
      if (holder) {
        json(response, 409, {
          code: 'SLOT_UNAVAILABLE',
          message: 'That time was taken while you were filling the form',
        });
        return;
      }

      const [day] = String(body.slotId).split('#');
      const record = {
        id: `srv_${randomUUID().slice(0, 8)}`,
        status: 'confirmed',
        createdAt: now(),
        slot: { id: body.slotId, start: instantOf(day, Number(String(body.slotId).split('#')[1])) },
        values,
        invitation: { status: 'sent', email },
        location: 'Studio 2, Torstraße 14',
        instructions: 'Ring the bell twice and ask for Ann.',
        calendarUrl: 'https://calendar.example.com/invite.ics',
        rescheduleUrl: 'https://app.example.com/bookings/reschedule',
        cancelUrl: 'https://app.example.com/bookings/cancel',
      };

      byKey.set(key, record);
      takenSlots.set(body.slotId, record.id);

      const shouldDrop = request.headers['x-example-drop'] === '1' || dropResponses(body.slotId);
      if (shouldDrop) {
        // Committed, then the answer never arrives: the client has to look it up.
        response.socket?.destroy();
        return;
      }

      json(response, 201, record);
      return;
    }

    json(response, 404, { code: 'GENERIC_FAILURE', message: `no route for ${url.pathname}` });
  };

  const server = createServer((request, response) => {
    handler(request, response).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[dev-server]', error);
      if (!response.headersSent)
        json(response, 500, { code: 'GENERIC_FAILURE', message: 'unexpected' });
      else response.end();
    });
  });

  return {
    server,
    state: { byKey, takenSlots },
    bookingOf,
    async listen(port = 8787, host = '127.0.0.1') {
      await new Promise((done, fail) => {
        server.once('error', fail);
        server.listen(port, host, done);
      });
      return server.address();
    },
    async close() {
      await new Promise((done) => server.close(done));
    },
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const portIndex = process.argv.indexOf('--port');
  const port = portIndex === -1 ? 8787 : Number(process.argv[portIndex + 1]);
  const example = createExampleServer();
  const address = await example.listen(port);
  console.log(`[dev-server] http://127.0.0.1:${address.port}`);
  console.log('[dev-server] GET  /api/availability?from=2026-05-04&to=2026-05-31&duration=30');
  console.log('[dev-server] GET  /api/slots?date=2026-05-04&duration=30');
  console.log('[dev-server] POST /api/bookings   (Idempotency-Key required)');
  console.log('[dev-server] GET  /api/bookings?key=<key>');
}
