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
  devil: { farkle6: 0.0309, win6: 0.798, ev6: 771, tier: 'diamond' },
  king: { farkle6: 0.0058, win6: 0.848, ev6: 856, tier: 'diamond' },
  queen: { farkle6: 0.0058, win6: 0.848, ev6: 856, tier: 'diamond' },
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
 * have to sit at the scale's ends: `king`, the highest-EV die shipped, rates
 * Power exactly 9 — one point short of the scale's ceiling, left open for
 * whatever ships next. Risk is deliberately the same shape, not `farkle6`
 * read straight: **higher is safer**, matching "how much risk you can
 * afford to take with this die" rather than "how dangerous it is", so
 * `worn` rates Risk 9 the same way `king` rates Power 9 — every other die is
 * cheaper by however great a multiple its own farkle6 is of `worn`'s.
 *
 * `queen`'s weights went through two cuts before M7 settled (crown-tuning
 * research): a flat-across-1–5 first pass ran to 82% win6 and briefly made
 * her both the safest die shipped *and* the highest-EV one, which would have
 * meant re-anchoring both constants around a single outlier. Suppressing her
 * `1` and `5` singles took both anchors off the table again — worth
 * recording so a future retune doesn't have to rediscover why they nearly
 * moved.
 *
 * M8 pushed the whole Diamond league to 80–90% win6 against the `smart` bot
 * and moved `king`'s crown from `5` to `2` to buy its ceiling with real risk
 * this time — briefly making `king` the roster's highest-farkle6 die at a
 * matching win rate. M9 then found that differentiated risk profile was
 * exactly what was killing the King/Queen Crown Bonus's synergy (a mixed
 * loadout lost to both pure ends rather than beating them), and made `king`
 * copy `queen`'s weights outright to get the synergy back — see
 * docs/researches/2026-08-13-king-queen-crown-twins.md. `king` and `queen`
 * are now the same die under two names, so `RISK_ANCHOR_ID`/
 * `POWER_ANCHOR_ID` below both land on an *exact* three-way tie: `king` and
 * `queen` share `worn`'s farkle6 to the 5th decimal place
 * (0.00576269..., `analyticalMetrics` is exact brute force, not simulated —
 * this isn't a rounding coincidence), so all three rate Risk 9.0, and
 * `king`/`queen` share the roster's highest ev6 (856) for Power 9.0. Which
 * of the two names holds `POWER_ANCHOR_ID` doesn't matter any more; `king`
 * just keeps the role it already had.
 */
export const RISK_ANCHOR_ID = 'worn';
export const POWER_ANCHOR_ID = 'king';
const RATING_ANCHOR = 9;

export function riskRating(dieId: string): number {
  const dangerRatio = DIE_STATS[dieId]!.farkle6 / DIE_STATS[RISK_ANCHOR_ID]!.farkle6;
  return RATING_ANCHOR + 1 - dangerRatio;
}

export function powerRating(dieId: string): number {
  return (DIE_STATS[dieId]!.ev6 / DIE_STATS[POWER_ANCHOR_ID]!.ev6) * RATING_ANCHOR;
}
