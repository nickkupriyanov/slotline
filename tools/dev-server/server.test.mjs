/**
 * The teaching server has to keep the promises the widget relies on: an idempotent
 * create, a discernible conflict, field errors, and a lookup for a lost answer.
 *
 *   node --test tools/dev-server/server.test.mjs
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createExampleServer } from './server.mjs';

const server = createExampleServer({ now: () => Date.parse('2026-05-04T09:00:00Z') });
let base = '';

before(async () => {
  const address = await server.listen(0);
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await server.close();
});

const post = (body, key, headers = {}) =>
  fetch(`${base}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': key, ...headers },
    body: JSON.stringify(body),
  });

const values = { name: 'Ann', email: 'ann@example.com' };

describe('the teaching server', () => {
  it('answers availability for weekdays only', async () => {
    const response = await fetch(`${base}/api/availability?from=2026-05-04&to=2026-05-10`);
    const days = await response.json();

    assert.equal(response.status, 200);
    // Monday to Friday; the weekend is closed.
    assert.deepEqual(
      days.map((day) => day.date),
      ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08'],
    );
    assert.equal(days[0].slotCount, 8);
  });

  it('lists the offers of a day and drops the ones that are taken', async () => {
    const before = await (await fetch(`${base}/api/slots?date=2026-05-05`)).json();
    assert.equal(before.length, 8);
    assert.equal(before[0].start, '2026-05-05T09:00:00.000Z');

    const created = await post({ slotId: before[0].id, values }, 'key-taken');
    assert.equal(created.status, 201);

    const after = await (await fetch(`${base}/api/slots?date=2026-05-05`)).json();
    assert.equal(after.length, 7);
    assert.ok(!after.some((slot) => slot.id === before[0].id));
  });

  it('requires an idempotency key', async () => {
    const response = await post({ slotId: '2026-05-06#10', values }, '');
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'ADAPTER_CONTRACT_VIOLATION');
  });

  it('returns the same record for a repeated key', async () => {
    const first = await post({ slotId: '2026-05-06#09', values }, 'key-repeat');
    const firstBody = await first.json();

    const second = await post({ slotId: '2026-05-06#09', values }, 'key-repeat');
    const secondBody = await second.json();

    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(secondBody.id, firstBody.id);
    assert.equal(secondBody.slot.id, firstBody.slot.id);
  });

  it('reports a conflict when someone else took the offer', async () => {
    await post({ slotId: '2026-05-07#11', values }, 'key-first');
    const response = await post({ slotId: '2026-05-07#11', values }, 'key-second');

    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'SLOT_UNAVAILABLE');
  });

  it('reports field errors for data it rejects', async () => {
    const response = await post(
      { slotId: '2026-05-08#12', values: { name: 'Ann' } },
      'key-invalid',
    );

    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.code, 'VALIDATION_FAILED');
    assert.ok(body.fieldErrors.email);
  });

  it('finds a record by the key of its attempt', async () => {
    const response = await fetch(`${base}/api/bookings?key=key-repeat`);
    const record = await response.json();

    assert.equal(response.status, 200);
    assert.equal(record.status, 'confirmed');
    assert.equal(record.invitation.status, 'sent');

    const missing = await fetch(`${base}/api/bookings?key=nothing-like-this`);
    assert.equal(missing.status, 404);
  });

  it('commits the record and loses the answer when asked to', async () => {
    await assert.rejects(
      post({ slotId: '2026-05-08#13', values }, 'key-dropped', { 'x-example-drop': '1' }),
      // The connection is dropped after the record exists.
      (error) => error instanceof TypeError || error.cause !== undefined,
    );

    // The application can still establish the outcome.
    const found = await fetch(`${base}/api/bookings?key=key-dropped`);
    assert.equal(found.status, 200);
    assert.equal((await found.json()).status, 'confirmed');
  });
});
