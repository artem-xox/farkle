import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const resolvePackage = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  plugins: [react()],
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
