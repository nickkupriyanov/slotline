import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIdempotencyKey } from './ids';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createIdempotencyKey', () => {
  it('generates a distinct key per attempt', () => {
    const keys = new Set(Array.from({ length: 250 }, () => createIdempotencyKey()));

    expect(keys.size).toBe(250);
    for (const key of keys) expect(key.length).toBeGreaterThan(8);
  });

  it('uses a UUID when the host provides one', () => {
    const key = createIdempotencyKey();

    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('falls back to a counter key when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {});
    const first = createIdempotencyKey(1_700_000_000_000);
    const second = createIdempotencyKey(1_700_000_000_000);

    expect(first).toMatch(/^bk_[0-9a-z]+_[0-9a-z]+_[0-9a-z]+$/);
    expect(first).not.toBe(second);
  });
});
