import type { BookingAdapter } from '@nickkupriyanov/slotline-core';
import { createExampleHttpAdapter } from '@slotline/example-server';

/**
 * The same server the React playground talks to.
 *
 * Start it with `node tools/dev-server/server.mjs --port 8787`; nothing in the
 * playgrounds requires it to be running, so the examples still work from a static
 * build.
 */
export const EXAMPLE_SERVER_URL = 'http://127.0.0.1:8787';

/** `drop` asks the server to create the record and lose the answer. */
export function serverAdapter(drop: boolean): BookingAdapter {
  return createExampleHttpAdapter({ baseUrl: EXAMPLE_SERVER_URL, dropResponse: drop });
}
