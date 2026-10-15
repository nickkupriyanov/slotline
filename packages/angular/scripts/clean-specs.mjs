/**
 * Removes the compiled spec output.
 *
 * `ngc` never deletes files it no longer emits, so a layout change would leave
 * stale specs behind — and Vitest runs every `.spec.js` it finds.
 */
import { rm } from 'node:fs/promises';

await rm(new URL('../out-tsc/aot-spec', import.meta.url), { recursive: true, force: true });
