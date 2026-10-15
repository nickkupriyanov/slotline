import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Angular unit tests.
 *
 * The specs run with Angular's own `TestBed` and Vitest 4, over the output of
 * Angular's compiler (`ngc -p tsconfig.aot-spec.json`, wired into `pnpm test`).
 *
 * The compiler is in charge because the widget uses signal inputs, which a
 * runtime (JIT) compilation cannot discover — and because the CLI's unit-test
 * builder cannot compile a library project's specs in 21.2: it builds its
 * TypeScript program from an application's entry points, and a library has none.
 *
 * The core is aliased to its sources for the same reason as in the React package:
 * a test run must not depend on a previous build.
 */
const core = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));
const coreDom = fileURLToPath(new URL('../core/src/dom/index.ts', import.meta.url));
// The `/forms` entry point imports the primary by package name. It has to resolve
// to the *compiled* primary, not to its source: a source component has no Angular
// metadata, so the runtime would JIT-compile it — and a JIT compilation cannot see
// signal inputs at all. `ngc` runs before Vitest and leaves its output here, which
// is also where the emitted specs import their siblings from.
const self = fileURLToPath(
  new URL('./out-tsc/aot-spec/packages/angular/src/public-api.js', import.meta.url),
);

export default defineConfig({
  resolve: {
    // Ordered: a bare string alias replaces the prefix and would break `/dom`.
    alias: [
      { find: /^@nickkupriyanov\/slotline-angular$/, replacement: self },
      { find: /^@nickkupriyanov\/slotline-core\/dom$/, replacement: coreDom },
      { find: /^@nickkupriyanov\/slotline-core$/, replacement: core },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: false,
    // Angular's compiler emits the specs, so the run is over the AOT output: the
    // templates are compiled by the real compiler, signal inputs included.
    include: ['out-tsc/aot-spec/**/*.spec.js'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
