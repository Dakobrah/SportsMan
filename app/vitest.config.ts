import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

/**
 * Two projects.
 *
 * The `node` project is the bulk of the suite: pure logic and real SQLite
 * through `node:sqlite`. Giving it a DOM would slow every one of those tests
 * for no benefit, so jsdom is confined to `components`.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/components/**'],
          environment: 'node',
        },
      },
      {
        // HMR is already inactive in a vitest run, and the plugin no longer
        // takes a `hot` option, so the defaults are what we want here.
        plugins: [svelte()],
        // Mandatory: without it Svelte 5 resolves its SSR entry and mount() throws.
        resolve: { conditions: ['browser'] },
        test: {
          name: 'components',
          include: ['tests/components/**/*.test.ts'],
          environment: 'jsdom',
          setupFiles: ['tests/support/setupDom.ts'],
        },
      },
    ],
  },
});
