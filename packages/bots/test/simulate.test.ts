import { describe, expect, it } from 'vitest';

import { ThresholdBot, type BotParams } from '../src/threshold-bot.js';
import { createPreset } from '../src/presets.js';
import { runSimulation } from '../src/simulate.js';

const params = (overrides: Partial<BotParams> = {}): BotParams => ({
  bankAt: 300,
  minDiceToThrow: 2,
  diceValue: 15,
  hotDiceAlwaysThrow: true,
  desperationMargin: 200,
  catchUpBonus: 0.5,
  mistakeRate: 0,
  ...overrides,
});

describe('runSimulation', () => {
  it('rejects a non-positive or non-integer match count', () => {
    const options = {
      matches: 0,
      seed: 1,
      makeA: (seed: number) => createPreset('balanced', seed),
      makeB: (seed: number) => createPreset('balanced', seed),
    };
    expect(() => runSimulation(options)).toThrow(RangeError);
    expect(() => runSimulation({ ...options, matches: -5 })).toThrow(RangeError);
    expect(() => runSimulation({ ...options, matches: 1.5 })).toThrow(RangeError);
  });

  it('reports internally consistent aggregates', () => {
    const report = runSimulation({
      matches: 300,
      seed: 42,
      makeA: (seed) => createPreset('cautious', seed),
      makeB: (seed) => createPreset('aggressive', seed),
    });

    expect(report.matches).toBe(300);
    expect(report.a.wins + report.b.wins).toBe(300);
    expect(report.a.winRate).toBeCloseTo(report.a.wins / 300, 10);
    expect(report.b.winRate).toBeCloseTo(1 - report.a.winRate, 10);

    for (const side of [report.a, report.b]) {
      expect(side.winRateCI95[0]).toBeLessThanOrEqual(side.winRate);
      expect(side.winRateCI95[1]).toBeGreaterThanOrEqual(side.winRate);
      expect(side.farkleRate).toBeGreaterThanOrEqual(0);
      expect(side.farkleRate).toBeLessThanOrEqual(1);
      expect(side.avgBankedPerBank).toBeGreaterThan(0);
      expect(side.avgTurnsPlayed).toBeGreaterThan(0);
    }
    expect(report.avgTurnsPerMatch).toBeGreaterThan(0);
  });

  it('is fully deterministic for a given seed', () => {
    const run = () =>
      runSimulation({
        matches: 200,
        seed: 2026,
        makeA: (seed) => createPreset('balanced', seed),
        makeB: (seed) => createPreset('novice', seed),
      });
    expect(run()).toEqual(run());
  });

  it('varies with the seed', () => {
    const base = { matches: 200, makeA: (s: number) => createPreset('balanced', s), makeB: (s: number) => createPreset('balanced', s) };
    const a = runSimulation({ ...base, seed: 1 });
    const b = runSimulation({ ...base, seed: 2 });
    expect(a.a.wins).not.toBe(b.a.wins);
  });

  it('measures a large, explicable gap between a strong and a deliberately bad policy', () => {
    // Banks the instant it has anything at all, so it almost never farkles a
    // turn's points away, versus a policy that never stops for its own
    // threshold and always takes a knowingly worse keep. Not a tuned
    // personality — a sanity check that the harness detects a real gap when
    // one obviously exists.
    const strong = params({ bankAt: 1, minDiceToThrow: 6, hotDiceAlwaysThrow: false, mistakeRate: 0 });
    const weak = params({ bankAt: 100_000, minDiceToThrow: 0, hotDiceAlwaysThrow: true, mistakeRate: 1 });

    const report = runSimulation({
      matches: 500,
      seed: 9,
      makeA: (seed) => new ThresholdBot('strong', strong, seed),
      makeB: (seed) => new ThresholdBot('weak', weak, seed),
    });

    expect(report.a.winRate).toBeGreaterThan(0.9);
    expect(report.a.winRateCI95[0]).toBeGreaterThan(0.5);
  });

  it('honours a custom target and loadout', () => {
    const report = runSimulation({
      matches: 50,
      seed: 3,
      target: 300,
      makeA: (seed) => createPreset('aggressive', seed),
      makeB: (seed) => createPreset('cautious', seed),
    });
    expect(report.matches).toBe(50);
    // A lower target should finish in noticeably fewer turns than the 2000 default.
    expect(report.avgTurnsPerMatch).toBeLessThan(20);
  });
});
