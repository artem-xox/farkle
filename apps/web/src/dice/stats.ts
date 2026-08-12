/**
 * Balance numbers and tiers copied from
 * docs/researches/2026-08-12-diamond-league-and-fun-dice.md (itself
 * `npm run dice:roster` / `npm run dice:tiers`) rather than recomputed here —
 * an exact recompute means enumerating up to 6^6 throws per die
 * (`scripts/dice-balance/lib.mjs`'s `analyticalMetrics`), fine as an offline
 * Node script but not as something fourteen dice redo on every render of the
 * picker.
 *
 * Regenerate with `npm run dice:roster` / `npm run dice:tiers` after
 * changing a die's weights or adding a new one, and copy `farkle6`, `win6`
 * and the resulting tier back in here.
 */
export type DieTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export interface DieStats {
  /** Farkle probability on a full six-die throw of this die. Also what a die's Dice-screen Risk rating is scaled from. */
  readonly farkle6: number;
  /** Win rate for six of this die against six ordinary dice — the project's own balance metric, and what the loadout picker's Power bar shows. */
  readonly win6: number;
  /** Expected value of a full six-die throw's best keep. What a die's Dice-screen Power rating is scaled from. */
  readonly ev6: number;
  /** Strength tier from the tier-report cut (research §2): gaps are only real where the 95% CIs on either side don't overlap. */
  readonly tier: DieTier;
}

export const DIE_STATS: Record<string, DieStats> = {
  balanced: { farkle6: 0.0309, win6: 0.498, ev6: 399, tier: 'bronze' },
  unlucky: { farkle6: 0.0361, win6: 0.481, ev6: 389, tier: 'bronze' },
  even: { farkle6: 0.0325, win6: 0.499, ev6: 396, tier: 'bronze' },
  odd: { farkle6: 0.0191, win6: 0.567, ev6: 431, tier: 'bronze' },
  trinity: { farkle6: 0.0286, win6: 0.588, ev6: 470, tier: 'silver' },
  twins: { farkle6: 0.0170, win6: 0.593, ev6: 461, tier: 'silver' },
  unbalanced: { farkle6: 0.0249, win6: 0.597, ev6: 466, tier: 'silver' },
  imp: { farkle6: 0.0273, win6: 0.599, ev6: 505, tier: 'silver' },
  trader: { farkle6: 0.0122, win6: 0.606, ev6: 448, tier: 'gold' },
  weighted: { farkle6: 0.0191, win6: 0.613, ev6: 473, tier: 'gold' },
  worn: { farkle6: 0.0058, win6: 0.618, ev6: 467, tier: 'gold' },
  cheat: { farkle6: 0.0365, win6: 0.624, ev6: 514, tier: 'gold' },
  king: { farkle6: 0.0169, win6: 0.669, ev6: 543, tier: 'diamond' },
  devil: { farkle6: 0.0520, win6: 0.682, ev6: 584, tier: 'diamond' },
};

/** Weakest to strongest — the order the loadout picker's catalog is grouped in. */
export const TIER_ORDER: readonly DieTier[] = ['bronze', 'silver', 'gold', 'diamond'];

export const TIER_LABEL: Record<DieTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  diamond: 'Diamond',
};

export const TIER_ICON: Record<DieTier, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  diamond: '💎',
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

/**
 * The Dice screen's Risk and Power ratings — a 1–10 read off `farkle6` and
 * `ev6` directly, unlike the loadout picker's bars (`RISK_RANGE`/
 * `POWER_RANGE` above), which are `win6`-based and stretched to fill the
 * roster's own min/max every time. These are zero-anchored against one
 * reference die each instead, so today's extremes don't have to sit at the
 * scale's ends: `worn`, the safest die shipped, rates Risk 1, and every
 * other die's rating is its `farkle6` as a multiple of `worn`'s. `devil`,
 * the highest-EV die shipped, rates Power 9 the same way — one point short
 * of the scale's ceiling, left open for whatever ships next.
 */
export const RISK_ANCHOR_ID = 'worn';
export const POWER_ANCHOR_ID = 'devil';
const POWER_ANCHOR_RATING = 9;

export function riskRating(dieId: string): number {
  return DIE_STATS[dieId]!.farkle6 / DIE_STATS[RISK_ANCHOR_ID]!.farkle6;
}

export function powerRating(dieId: string): number {
  return (DIE_STATS[dieId]!.ev6 / DIE_STATS[POWER_ANCHOR_ID]!.ev6) * POWER_ANCHOR_RATING;
}
