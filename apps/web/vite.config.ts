import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const resolvePackage = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

// The document CSP in index.html is written for what we actually ship. Dev is
// served differently and trips two directives that the build never does:
//   - CSS arrives as JS that injects a <style> tag rather than as a stylesheet,
//     so `style-src 'self'` blocks every rule and the app renders unstyled.
//   - Vite polls for a server restart from a blob: worker, which falls back to
//     `script-src 'self'` and never reconnects.
// Relax exactly those two for `vite dev`; the built index.html stays strict.
const devCsp = (): Plugin => ({
  name: 'farkle-dev-csp',
  apply: 'serve',
  transformIndexHtml: (html) =>
    html.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'; worker-src 'self' blob:"),
});

export default defineConfig({
  plugins: [react(), devCsp()],
  resolve: {
    alias: {
      // Resolve straight to source rather than each package's `dist/`, so
      // the web app never needs a prior `tsc` build of the engine or bots to
      // run in dev, and picks up source edits instantly. Vite/esbuild
      // compiles these on the fly, same as apps/web's own .ts/.tsx files.
      '@farkle/engine': resolvePackage('../../packages/engine/src/index.ts'),
      '@farkle/bots': resolvePackage('../../packages/bots/src/index.ts'),
    },
  },
});
