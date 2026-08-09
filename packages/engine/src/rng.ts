/**
 * Seeded PRNG (mulberry32), written as pure state transitions so that the
 * generator can live inside serialisable game state and a match can be replayed
 * exactly from its seed.
 */

/** Opaque generator state. A uint32. */
export type RngState = number;

export interface RngResult {
  readonly value: number;
  readonly state: RngState;
}

export function seedRng(seed: number): RngState {
  return seed >>> 0;
}

/** Next uniform uint32. */
export function nextU32(state: RngState): RngResult {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: (t ^ (t >>> 14)) >>> 0, state: a >>> 0 };
}

/**
 * Next uniform integer in `[0, bound)`, by rejection sampling. Modulo alone
 * would bias the low values, which a chi-square test over a loaded die is
 * precisely the wrong place to discover.
 */
export function nextBelow(state: RngState, bound: number): RngResult {
  if (!Number.isInteger(bound) || bound <= 0) {
    throw new RangeError(`bound must be a positive integer, got ${bound}`);
  }
  const limit = Math.floor(0x1_0000_0000 / bound) * bound;
  let current = state;
  for (;;) {
    const next = nextU32(current);
    current = next.state;
    if (next.value < limit) {
      return { value: next.value % bound, state: current };
    }
  }
}
