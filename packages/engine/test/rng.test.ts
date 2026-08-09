import { describe, expect, it } from 'vitest';

import { nextBelow, nextU32, seedRng, type RngState } from '../src/rng.js';

function take(count: number, state: RngState, bound?: number): number[] {
  const values: number[] = [];
  let current = state;
  for (let n = 0; n < count; n++) {
    const result = bound === undefined ? nextU32(current) : nextBelow(current, bound);
    values.push(result.value);
    current = result.state;
  }
  return values;
}

describe('seeded generator', () => {
  it('is deterministic — the same seed replays the same sequence', () => {
    expect(take(100, seedRng(12345))).toEqual(take(100, seedRng(12345)));
  });

  it('produces different sequences for different seeds', () => {
    expect(take(100, seedRng(1))).not.toEqual(take(100, seedRng(2)));
  });

  it('does not mutate the state it is given', () => {
    const state = seedRng(7);
    const first = nextU32(state);
    const second = nextU32(state);
    expect(second).toEqual(first);
  });

  it('stays within uint32', () => {
    for (const value of take(1000, seedRng(99))) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });
});

describe('nextBelow', () => {
  it('rejects a non-positive or non-integer bound', () => {
    expect(() => nextBelow(seedRng(1), 0)).toThrow(RangeError);
    expect(() => nextBelow(seedRng(1), -3)).toThrow(RangeError);
    expect(() => nextBelow(seedRng(1), 1.5)).toThrow(RangeError);
  });

  it('always lands inside the bound', () => {
    for (const bound of [1, 2, 6, 15, 1000]) {
      for (const value of take(2000, seedRng(bound), bound)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(bound);
      }
    }
  });

  it('is uniform over a small bound', () => {
    const bound = 6;
    const samples = 120_000;
    const observed = new Array<number>(bound).fill(0);
    for (const value of take(samples, seedRng(2024), bound)) {
      observed[value]!++;
    }

    const expectedCount = samples / bound;
    const chiSquare = observed.reduce(
      (total, count) => total + (count - expectedCount) ** 2 / expectedCount,
      0,
    );
    // 5 degrees of freedom, critical value at p = 0.001. The seed is fixed, so
    // this is deterministic rather than flaky.
    expect(chiSquare).toBeLessThan(20.515);
  });
});
