import { copyFileSync } from 'node:fs';

import { defineConfig, type Plugin } from 'vite';

/** El service worker no lo importa nadie, así que se copia tal cual al build. */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    closeBundle: () => copyFileSync('src/sw.ts', 'dist/sw.js'),
  };
}

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  plugins: [serviceWorker()],
});
