import { describe, expect, it } from 'vitest';

import { wilsonInterval } from '../src/stats.js';

describe('wilsonInterval', () => {
  it('is centred on 0.5 for a 50/50 split, symmetric by construction', () => {
    const [low, high] = wilsonInterval(50, 100);
    expect((low + high) / 2).toBeCloseTo(0.5, 10);
  });

  it('matches the standard reference value for p=0.5, n=100, 95%', () => {
    // Commonly cited Wilson interval for 50/100 at z=1.96.
    const [low, high] = wilsonInterval(50, 100);
    expect(low).toBeCloseTo(0.4038, 3);
    expect(high).toBeCloseTo(0.5962, 3);
  });

  it('stays within [0, 1] even at the extremes', () => {
    for (const trials of [1, 10, 1000]) {
      const [lowAllFail, highAllFail] = wilsonInterval(0, trials);
      expect(lowAllFail).toBeGreaterThanOrEqual(0);
      expect(highAllFail).toBeGreaterThan(0);
      expect(highAllFail).toBeLessThanOrEqual(1);

      const [lowAllPass, highAllPass] = wilsonInterval(trials, trials);
      expect(lowAllPass).toBeGreaterThanOrEqual(0);
      expect(lowAllPass).toBeLessThan(1);
      expect(highAllPass).toBeLessThanOrEqual(1);
    }
  });

  it('mirrors around 0.5 when successes and failures are swapped', () => {
    const [lowA, highA] = wilsonInterval(30, 100);
    const [lowB, highB] = wilsonInterval(70, 100);
    expect(lowB).toBeCloseTo(1 - highA, 10);
    expect(highB).toBeCloseTo(1 - lowA, 10);
  });

  it('narrows as the sample size grows, for the same observed rate', () => {
    const widthAt = (n: number) => {
      const [low, high] = wilsonInterval(Math.round(n * 0.5), n);
      return high - low;
    };
    expect(widthAt(1000)).toBeLessThan(widthAt(100));
    expect(widthAt(100)).toBeLessThan(widthAt(10));
  });

  it('rejects invalid trials or successes', () => {
    expect(() => wilsonInterval(1, 0)).toThrow(RangeError);
    expect(() => wilsonInterval(1, -5)).toThrow(RangeError);
    expect(() => wilsonInterval(-1, 10)).toThrow(RangeError);
    expect(() => wilsonInterval(11, 10)).toThrow(RangeError);
    expect(() => wilsonInterval(1.5, 10)).toThrow(RangeError);
  });
});
