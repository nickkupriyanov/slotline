/**
 * Identifier helpers.
 *
 * An idempotency key has to be unique, not secret: the server only needs to
 * recognise a repeat of the same attempt. `crypto.randomUUID()` is used when the
 * host provides it; the counter fallback keeps the library working in older
 * runtimes and in tests.
 */

let fallbackCounter = 0;

/** A fresh key for one creation attempt. */
export function createIdempotencyKey(now: number = Date.now()): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  fallbackCounter += 1;
  const random = Math.random().toString(36).slice(2, 10);
  return `bk_${now.toString(36)}_${fallbackCounter.toString(36)}_${random}`;
}
