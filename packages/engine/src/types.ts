import type { DieSpec } from './dice.js';

/** A physical die pip, 1 through 6. */
export type Pip = 1 | 2 | 3 | 4 | 5 | 6;

export const PIPS: readonly Pip[] = [1, 2, 3, 4, 5, 6];

/**
 * The Devil's Head face — see docs/RULES.md §11. A string literal rather than
 * a seventh number so that any arithmetic written against a bare `Face`
 * (`face - 1` and friends) fails to typecheck instead of silently producing
 * `NaN`, which forces every call site that needs to to handle it explicitly.
 */
export const WILD = 'W' as const;
export type Wild = typeof WILD;

/** A die face: one of the six pips, or the Devil's Head wildcard. */
export type Face = Pip | Wild;

export function isWild(face: Face): face is Wild {
  return face === WILD;
}

/** Number of dice a player throws at the start of a turn. */
export const DICE_PER_TURN = 6;

export type ComboKind =
  | 'Single'
  | 'OfAKind'
  | 'StraightLow'
  | 'StraightHigh'
  | 'StraightFull';

/**
 * One scoring combination and the dice it consumes. `faces` is always the
 * physical pips the combination reads as — a Devil's Head resolved into that
 * value, never `WILD` itself. `wilds` says how many of those pips came from a
 * wildcard rather than a die that actually showed that face.
 */
export interface Combo {
  readonly kind: ComboKind;
  readonly faces: readonly Pip[];
  readonly points: number;
  readonly wilds: number;
}

/** A legal way to keep dice from a throw. */
export interface KeepOption {
  /** Indices into the throw. One representative per distinct multiset of faces. */
  readonly indices: readonly number[];
  /** The kept faces exactly as thrown, ascending — a Devil's Head reads as `WILD`. */
  readonly faces: readonly Face[];
  /** `faces`, with every `WILD` resolved to the pip it is read as in this keep. */
  readonly resolved: readonly Pip[];
  readonly points: number;
  readonly combos: readonly Combo[];
  /**
   * Dice left in play after this keep, counted literally. Zero means the keep
   * used every die, which the match rules turn into hot dice — the engine's
   * scoring layer does not apply that rule.
   */
  readonly diceLeft: number;
  /**
   * The specs of the dice left in play after this keep, order not meaningful
   * — only present when `legalKeeps` was told which dice threw `faces`. Two
   * keeps that take the same points from the same face values are still
   * different choices if they leave different dice behind (a Devil's Head
   * versus an ordinary die), so this is what lets `legalKeeps` tell them
   * apart instead of silently discarding one as a duplicate.
   */
  readonly diceLeftSpecs?: readonly DieSpec[];
}

/** Face counts, indexed by `face - 1`. */
export type Counts = readonly [number, number, number, number, number, number];
