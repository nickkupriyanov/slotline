/**
 * The matcher types of `@testing-library/jest-dom/vitest`, declared here.
 *
 * jest-dom augments Vitest's assertion interface from *its* module resolution, and
 * a workspace with more than one Vitest major can leave that pointing at the wrong
 * copy. Declaring the same augmentation from this package keeps it bound to the
 * Vitest the React tests actually use; the runtime side still comes from the
 * `@testing-library/jest-dom/vitest` import in `setup.ts`.
 */
import 'vitest';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  interface Assertion<T = unknown> extends TestingLibraryMatchers<unknown, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
}
