import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * The tests run against the sources, so the framework-free core is aliased to
 * its `src` instead of the (possibly stale or missing) `dist`.
 */
const core = fileURLToPath(new URL('../core/src/index.ts', import.meta.url));
const coreDom = fileURLToPath(new URL('../core/src/dom/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Order matters: a bare string alias replaces the prefix, which would turn the
    // `/dom` subpath into `…/src/index.ts/dom`.
    alias: [
      { find: /^@nickkupriyanov\/slotline-core\/dom$/, replacement: coreDom },
      { find: '@nickkupriyanov/slotline-core', replacement: core },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
  },
});
