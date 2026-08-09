import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@farkle/engine': path.resolve(import.meta.dirname, 'packages/engine/src/index.ts'),
      '@farkle/bots': path.resolve(import.meta.dirname, 'packages/bots/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
  },
});
