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
    /*
     * Vitest defaults to 5s, which does not suit this suite. The tests here
     * are deliberately heavy — exhaustive enumeration over all 46 656 six-die
     * throws, brute-force oracles, Monte Carlo runs of thousands of matches —
     * and CI runners are slower than a dev machine, so a test comfortable
     * locally can still blow a 5s budget there. That gap has now failed CI
     * twice, each time on a different test, each time discovered only after a
     * merge.
     *
     * 30s against a current worst case of ~4.5s. Generous enough that honest
     * work never trips it, short enough that a genuine hang still fails the
     * run rather than the job's own timeout.
     */
    testTimeout: 30_000,
  },
});
