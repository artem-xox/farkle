/** A die face. Wildcards are not part of v1 — see docs/RULES.md §11. */
export type Face = 1 | 2 | 3 | 4 | 5 | 6;

export const FACES: readonly Face[] = [1, 2, 3, 4, 5, 6];

/** Number of dice a player throws at the start of a turn. */
export const DICE_PER_TURN = 6;

export type ComboKind =
  | 'Single'
  | 'OfAKind'
  | 'StraightLow'
  | 'StraightHigh'
  | 'StraightFull';

/** One scoring combination and the dice it consumes. */
export interface Combo {
  readonly kind: ComboKind;
  readonly faces: readonly Face[];
  readonly points: number;
}

/** A legal way to keep dice from a throw. */
export interface KeepOption {
  /** Indices into the throw. One representative per distinct multiset of faces. */
  readonly indices: readonly number[];
  /** The kept faces, ascending. */
  readonly faces: readonly Face[];
  readonly points: number;
  readonly combos: readonly Combo[];
  /**
   * Dice left in play after this keep, counted literally. Zero means the keep
   * used every die, which the match rules turn into hot dice — the engine's
   * scoring layer does not apply that rule.
   */
  readonly diceLeft: number;
}

/** Face counts, indexed by `face - 1`. */
export type Counts = readonly [number, number, number, number, number, number];
