import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  /**
   * GitHub Pages serves the playground from `/slotline/`, so the deploy job
   * exports `PAGES_BASE=/slotline/`. Local dev and the layout guard keep `/`.
   */
  base: process.env.PAGES_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: [
      // The playground runs against the sources so the dev server hot-reloads
      // the library itself. Consumers import the built package instead.
      {
        find: '@nickkupriyanov/slotline-react/styles.css',
        replacement: source('../../packages/core/src/styles/index.css'),
      },
      {
        find: '@nickkupriyanov/slotline-react/motion',
        replacement: source('../../packages/react/src/motion.ts'),
      },
      {
        find: '@nickkupriyanov/slotline-react',
        replacement: source('../../packages/react/src/index.ts'),
      },
      // The client of the teaching server, shared with the Angular playground.
      {
        find: '@slotline/example-server',
        replacement: source('../../tools/dev-server/adapter.ts'),
      },
      // The `/dom` subpath has to be matched first: the entry below is a prefix
      // alias and would otherwise rewrite it into `…/src/index.ts/dom`.
      {
        find: '@nickkupriyanov/slotline-core/dom',
        replacement: source('../../packages/core/src/dom/index.ts'),
      },
      {
        find: '@nickkupriyanov/slotline-core',
        replacement: source('../../packages/core/src/index.ts'),
      },
    ],
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: source('index.html'),
        gallery: source('gallery.html'),
      },
    },
  },
});
