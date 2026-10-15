import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBookingController } from '@nickkupriyanov/slotline-core';
import { createExampleServer } from '../../../tools/dev-server/server.mjs';
import { createExampleHttpAdapter } from '../../../tools/dev-server/adapter';

/**
 * The teaching server and the adapter both bindings use, driven through the real
 * controller.
 *
 * One scenario, end to end: the server commits the record and the answer never
 * arrives. The widget must not call that a success *or* a failure — it shows the
 * attempt screen — and the application establishes the outcome with the key of that
 * attempt, using the same adapter on the same server.
 */
const server = createExampleServer({ now: () => Date.parse('2026-05-04T09:00:00Z') });
let baseUrl = '';

beforeAll(async () => {
  const address = await server.listen(0);
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await server.close();
});

/** Waits for the controller to reach a condition; a real socket needs real time. */
async function settle(
  controller: ReturnType<typeof createBookingController>,
  until?: () => boolean,
  what = 'the expected state',
): Promise<void> {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (!until) return;
    if (until()) return;
  }
  const view = controller.getSnapshot().view;
  throw new Error(
    `timed out waiting for ${what} (step ${view.step}, month ${view.month.status}${
      view.month.error ? `: ${view.month.error}` : ''
    })`,
  );
}

describe('the teaching server through the shared adapter', () => {
  it('keeps an unknown outcome unknown until the application resolves it', async () => {
    const keys: string[] = [];
    const adapter = createExampleHttpAdapter({ baseUrl, dropResponse: true });
    const controller = createBookingController({
      adapter,
      config: { locale: 'en' },
      inputs: { timeZone: 'UTC' },
      handlers: {
        onError: (_error, context) => {
          if (context.request) keys.push(context.request.idempotencyKey);
        },
      },
    });

    // The controller deliberately requests nothing until it is started, and the
    // derived snapshot is cached until someone subscribes.
    const unsubscribe = controller.subscribe(() => {});
    controller.start();
    await settle(
      controller,
      () => Object.values(controller.getSnapshot().view.days).some((day) => day?.bookable),
      'a bookable day from the server',
    );

    const view = controller.getSnapshot().view;
    const day = Object.keys(view.days).find((key) => view.days[key]?.bookable) as string;
    controller.actions.selectDate(day);
    await settle(
      controller,
      () => controller.getSnapshot().state.slots.length > 0,
      'the offers of the day',
    );

    controller.actions.selectSlot(controller.getSnapshot().state.slots[0]!);
    controller.actions.setValues({ name: 'Ann', email: 'ann@example.com' } as never);
    void controller.actions.submit();
    await settle(
      controller,
      () => controller.getSnapshot().view.step === 'attempt',
      'the attempt screen',
    );

    // The server created the record; the client only knows that it cannot know.
    const blocked = controller.getSnapshot().view;
    expect(blocked.attempt?.retryAllowed).toBe(true);
    expect(blocked.confirmation).toBeNull();
    expect(keys).toHaveLength(1);

    const key = keys[0] as string;
    const found = await adapter.findBooking(key);
    expect(found?.status).toBe('confirmed');
    expect(found?.id).toMatch(/^srv_/);
    expect(found?.invitation?.status).toBe('sent');

    // A repeated attempt on the same key is the same record, which is what makes the
    // retry the widget offers safe.
    const slot = (found as { slot?: { id?: string; start?: string } }).slot;
    const again = await adapter.createBooking({
      idempotencyKey: key,
      slot: { id: String(slot?.id ?? ''), start: String(slot?.start ?? '') },
      values: { name: 'Ann', email: 'ann@example.com' },
    } as never);
    expect(again.id).toBe(found?.id);

    const accepted = controller.actions.resolveAttempt({
      idempotencyKey: key,
      outcome: { status: 'created', result: found! },
    });
    await settle(
      controller,
      () => controller.getSnapshot().view.step === 'confirmed',
      'the confirmation',
    );

    expect(accepted).toBe(true);
    expect(controller.getSnapshot().view.confirmation?.id).toBe(found?.id);
    unsubscribe();
  }, 20000);
});
