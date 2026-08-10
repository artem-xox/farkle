/**
 * Two of the balance numbers from the roster table in docs/DESIGN.md §5,
 * copied rather than recomputed here — an exact recompute means enumerating
 * up to 6^6 throws per die (`scripts/dice-balance/lib.mjs`'s
 * `analyticalMetrics`), which is fine as an offline Node script but not as
 * something nine dice redo on every render of the picker.
 *
 * Regenerate with `npm run dice:roster` after changing a die's weights, and
 * copy the `farkle3` and `ev6` columns back in here.
 */
export interface DieStats {
  /** Farkle probability on a throw of three of this die — how safe it stays late in a turn. */
  readonly farkle3: number;
  /** Expected best-keep points on a full six-die throw of this die — what it's worth when it connects. */
  readonly ev6: number;
}

export const DIE_STATS: Record<string, DieStats> = {
  balanced: { farkle3: 0.278, ev6: 399 },
  odd: { farkle3: 0.222, ev6: 431 },
  trinity: { farkle3: 0.379, ev6: 470 },
  imp: { farkle3: 0.508, ev6: 505 },
  trader: { farkle3: 0.175, ev6: 448 },
  devil: { farkle3: 0.475, ev6: 515 },
  weighted: { farkle3: 0.219, ev6: 473 },
  worn: { farkle3: 0.192, ev6: 467 },
  cheat: { farkle3: 0.35, ev6: 514 },
};

function range(values: readonly number[]): readonly [number, number] {
  return [Math.min(...values), Math.max(...values)];
}

const allStats = Object.values(DIE_STATS);

/** [min, max] of `farkle3` across the roster — the scale a risk bar is drawn against. */
export const FARKLE3_RANGE = range(allStats.map((stats) => stats.farkle3));

/** [min, max] of `ev6` across the roster — the scale a power bar is drawn against. */
export const EV6_RANGE = range(allStats.map((stats) => stats.ev6));

/** Where `value` falls between `[min, max]`, as a 0–100 bar width. Flat roster (min === max) draws a full bar rather than dividing by zero. */
export function barWidth(value: number, [min, max]: readonly [number, number]): number {
  if (max === min) {
    return 100;
  }
  return ((value - min) / (max - min)) * 100;
}
