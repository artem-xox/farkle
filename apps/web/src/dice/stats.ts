/**
 * Balance numbers and tiers copied from
 * docs/researches/2026-08-10-mixed-loadout-strategy.md §1–2 (itself
 * `npm run dice:roster` / `npm run dice:tiers` at commit `26feda6`) rather
 * than recomputed here — an exact recompute means enumerating up to 6^6
 * throws per die (`scripts/dice-balance/lib.mjs`'s `analyticalMetrics`),
 * fine as an offline Node script but not as something nine dice redo on
 * every render of the picker.
 *
 * Regenerate with `npm run dice:roster` / `npm run dice:tiers` after
 * changing a die's weights or adding a new one, and copy `farkle6`, `win6`
 * and the resulting tier back in here.
 */
export type DieTier = 'bronze' | 'silver' | 'gold';

export interface DieStats {
  /** Farkle probability on a full six-die throw of this die. `1 - farkle6` is what the Risk bar shows: how often a throw of this die alone survives. */
  readonly farkle6: number;
  /** Win rate for six of this die against six ordinary dice — the project's own balance metric, and what the Power bar shows. */
  readonly win6: number;
  /** Strength tier from the tier-report cut (research §2): gaps are only real where the 95% CIs on either side don't overlap. */
  readonly tier: DieTier;
}

export const DIE_STATS: Record<string, DieStats> = {
  balanced: { farkle6: 0.0309, win6: 0.498, tier: 'bronze' },
  odd: { farkle6: 0.0191, win6: 0.567, tier: 'bronze' },
  trinity: { farkle6: 0.0286, win6: 0.588, tier: 'silver' },
  imp: { farkle6: 0.0273, win6: 0.599, tier: 'silver' },
  trader: { farkle6: 0.0122, win6: 0.606, tier: 'gold' },
  devil: { farkle6: 0.0626, win6: 0.612, tier: 'gold' },
  weighted: { farkle6: 0.0191, win6: 0.613, tier: 'gold' },
  worn: { farkle6: 0.0058, win6: 0.618, tier: 'gold' },
  cheat: { farkle6: 0.0365, win6: 0.624, tier: 'gold' },
};

/** Weakest to strongest — the order the loadout picker's catalog is grouped in. */
export const TIER_ORDER: readonly DieTier[] = ['bronze', 'silver', 'gold'];

export const TIER_LABEL: Record<DieTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
};

export const TIER_ICON: Record<DieTier, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
};

function range(values: readonly number[]): readonly [number, number] {
  return [Math.min(...values), Math.max(...values)];
}

const allStats = Object.values(DIE_STATS);

/** [min, max] of `1 - farkle6` across the roster — the scale a Risk bar is drawn against. */
export const RISK_RANGE = range(allStats.map((stats) => 1 - stats.farkle6));

/** [min, max] of `win6` across the roster — the scale a Power bar is drawn against. */
export const POWER_RANGE = range(allStats.map((stats) => stats.win6));

/** Where `value` falls between `[min, max]`, as a 0–100 bar width. Flat roster (min === max) draws a full bar rather than dividing by zero. */
export function barWidth(value: number, [min, max]: readonly [number, number]): number {
  if (max === min) {
    return 100;
  }
  return ((value - min) / (max - min)) * 100;
}
