/**
 * Balance numbers and tiers copied from offline `npm run dice:roster` /
 * `npm run dice:tiers` runs rather than recomputed here — an exact recompute
 * means enumerating up to 6^6 throws per die (`scripts/dice-balance/lib.mjs`'s
 * `analyticalMetrics`), fine as an offline Node script but not as something
 * fifteen dice redo on every render of the picker.
 *
 * Regenerate with `npm run dice:roster` / `npm run dice:tiers` after
 * changing a die's weights or adding a new one, and copy `farkle6`, `win6`
 * and the resulting tier back in here.
 */
export type DieTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export interface DieStats {
  /** Farkle probability on a full six-die throw of this die. What a die's Risk rating (`riskRating` below) is scaled from. */
  readonly farkle6: number;
  /** Win rate for six of this die against six ordinary dice — the project's own balance metric. Drives tier assignment and the within-tier sort, not the Risk/Power ratings. */
  readonly win6: number;
  /** Expected value of a full six-die throw's best keep. What a die's Power rating (`powerRating` below) is scaled from. */
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
  devil: { farkle6: 0.0455, win6: 0.711, ev6: 633, tier: 'diamond' },
  king: { farkle6: 0.0562, win6: 0.717, ev6: 655, tier: 'diamond' },
  queen: { farkle6: 0.0033, win6: 0.821, ev6: 691, tier: 'diamond' },
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

/**
 * The single Risk/Power rating per die — a 1–10 read off `farkle6` and `ev6`
 * directly (not `win6`), shared by both the Dice screen's numeric readout
 * and the loadout picker's stat bars, rather than each computing its own.
 * Zero-anchored against one reference die each, so today's extremes don't
 * have to sit at the scale's ends: `queen`, the highest-EV die shipped,
 * rates Power exactly 9 — one point short of the scale's ceiling, left open
 * for whatever ships next. Risk is deliberately the same shape, not
 * `farkle6` read straight: **higher is safer**, matching "how much risk you
 * can afford to take with this die" rather than "how dangerous it is", so
 * `worn` rates Risk 9 the same way `queen` rates Power 9 — every other die
 * is cheaper by however great a multiple its own farkle6 is of `worn`'s.
 *
 * `queen` is also the safest die shipped now (0.33% farkle6 against
 * `worn`'s 0.58%), but the Risk anchor deliberately did *not* move to her:
 * `worn` to `queen` is a 1.8x gap, big enough that re-anchoring on so much
 * smaller a farkle6 would push several other dice to or below 0 — the
 * ceiling headroom exists precisely to absorb an outlier like this (`queen`
 * lands at 9.4 instead) rather than redrawing the whole scale around it.
 * Contrast
 * `POWER_ANCHOR_ID`, which *did* move (`king`'s 655 ev6 to `queen`'s 691):
 * that gap is only 1.05x, small enough that moving it barely perturbs
 * anyone else's number the way the Risk move would have.
 */
export const RISK_ANCHOR_ID = 'worn';
export const POWER_ANCHOR_ID = 'queen';
const RATING_ANCHOR = 9;

export function riskRating(dieId: string): number {
  const dangerRatio = DIE_STATS[dieId]!.farkle6 / DIE_STATS[RISK_ANCHOR_ID]!.farkle6;
  return RATING_ANCHOR + 1 - dangerRatio;
}

export function powerRating(dieId: string): number {
  return (DIE_STATS[dieId]!.ev6 / DIE_STATS[POWER_ANCHOR_ID]!.ev6) * RATING_ANCHOR;
}
