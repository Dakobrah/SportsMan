/**
 * The playable web demo.
 *
 * Separate from the app config because the demo has different needs: it is
 * served from a versioned path on a CDN, so every asset reference must be
 * relative. The sql.js WebAssembly is not handled here -- web.ts imports it
 * with `?url`, so Vite emits it like any other asset.
 */
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { copyFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [
    svelte(),
    {
      name: 'demo-index',
      closeBundle() {
        // demo.html is the entry point, but the bucket serves index.html.
        copyFileSync(resolve('dist-demo/demo.html'), resolve('dist-demo/index.html'));
        rmSync(resolve('dist-demo/demo.html'));
      },
    },
  ],
  // Relative, so the build works under /sportsman/<version>/ without knowing
  // the version at build time.
  base: './',
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    // demo.html is the entry, and it is emitted as index.html below so the
    // published path serves it without a redirect.
    rollupOptions: { input: resolve('demo.html') },
  },
});
