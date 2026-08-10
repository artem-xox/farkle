import {
  BALANCED_DIE,
  bestKeep,
  hasScoringDice,
  WILD,
  type DieSpec,
  type Face,
  type Pip,
} from '@farkle/engine';

/**
 * Sorted, comma-joined die ids — a set of dice is symmetric under reordering,
 * so this is a canonical cache key regardless of which order the caller's
 * loadout lists them in. Relies on the invariant that a given die id always
 * names the same weights and wild face — true for everything in `DICE` and
 * for a loadout built from it, which is the only way dice reach a bot.
 */
function cacheKey(dice: readonly DieSpec[]): string {
  return dice
    .map((die) => die.id)
    .sort()
    .join(',');
}

const farkleCache = new Map<string, number>();

/**
 * Exact probability that throwing exactly these dice farkles — no Monte
 * Carlo, no heuristic. Enumerates every one of the (at most 6^6) outcomes,
 * weighted by the product of each die's own integer weights, and sums the
 * ones `hasScoringDice` rejects. Cached per distinct multiset of die ids,
 * since a real game only ever throws a handful of distinct loadouts.
 *
 * A Devil's Head can never complete a `Single` on its own (docs/RULES.md
 * §4a), so a die that paints one over its `1` gives up the 100-point single
 * and gets back a face that only pays inside a bigger combination. Whether
 * that trade is a net safety loss depends on the die's weights, not on the
 * wildcard alone: `DEVIL_DIE` farkles at least as often as `BALANCED_DIE` in
 * any company, while `IMP_DIE` — whose wildcard sits on the already-worthless
 * `6` — is *safer* than a balanced die once enough other wildcards are around
 * to gang up into a triple. Both are asserted over the whole roster in the
 * `farkleProbability` tests rather than assumed here.
 */
export function farkleProbability(dice: readonly DieSpec[]): number {
  if (dice.length === 0) {
    // No die to throw is not a state a real turn reaches, but it is a
    // sensible limit: nothing to roll can never produce a scoring die.
    return 1;
  }

  const key = cacheKey(dice);
  const cached = farkleCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const totals = dice.map((die) => die.weights.reduce((sum, weight) => sum + weight, 0));
  const denominator = totals.reduce((product, total) => product * total, 1);

  const faces: Face[] = new Array(dice.length);
  let farkleCount = 0;

  function recurse(index: number, countSoFar: number): void {
    if (index === dice.length) {
      if (!hasScoringDice(faces)) {
        farkleCount += countSoFar;
      }
      return;
    }
    const die = dice[index]!;
    for (let pipIndex = 0; pipIndex < 6; pipIndex++) {
      const weight = die.weights[pipIndex]!;
      if (weight === 0) {
        continue;
      }
      const pip = (pipIndex + 1) as Pip;
      faces[index] = die.wild === pip ? WILD : pip;
      recurse(index + 1, countSoFar * weight);
    }
  }

  recurse(0, 1);

  const probability = farkleCount / denominator;
  farkleCache.set(key, probability);
  return probability;
}

const expectedValueCache = new Map<string, number>();

/**
 * Expected points from the best legal keep of one throw of exactly these
 * dice, counting a farkle as zero — the companion to `farkleProbability`, by
 * the same exhaustive weighted enumeration and cached the same way.
 *
 * Deliberately *unconditional*: the farkle outcomes are included at 0 rather
 * than excluded, because that is the form the throw-or-bank comparison wants.
 * With `p = farkleProbability(dice)` and this value as `g`, banking a turn
 * score of `S` is worth `S`, while throwing and then banking is worth
 * `(1 - p) * (S + E[points | scoring])`, and since `g = (1 - p) *
 * E[points | scoring]` by construction, throwing wins exactly when
 * `g > S * p`. See `ThresholdBot`'s `evBanking` rule.
 *
 * Assumes the thrower takes the highest-scoring keep. A bot with a positive
 * `diceValue` sometimes prefers a lower-scoring keep that hoards dice, so
 * this slightly overstates `g` for such a bot — noted rather than modelled,
 * since the keep actually chosen depends on the same policy this feeds.
 */
export function expectedKeepValue(dice: readonly DieSpec[]): number {
  if (dice.length === 0) {
    return 0;
  }

  const key = cacheKey(dice);
  const cached = expectedValueCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const totals = dice.map((die) => die.weights.reduce((sum, weight) => sum + weight, 0));
  const denominator = totals.reduce((product, total) => product * total, 1);

  const faces: Face[] = new Array(dice.length);
  let pointsWeight = 0;

  function recurse(index: number, countSoFar: number): void {
    if (index === dice.length) {
      const keep = bestKeep(faces);
      if (keep !== null) {
        pointsWeight += countSoFar * keep.points;
      }
      return;
    }
    const die = dice[index]!;
    for (let pipIndex = 0; pipIndex < 6; pipIndex++) {
      const weight = die.weights[pipIndex]!;
      if (weight === 0) {
        continue;
      }
      const pip = (pipIndex + 1) as Pip;
      faces[index] = die.wild === pip ? WILD : pip;
      recurse(index + 1, countSoFar * weight);
    }
  }

  recurse(0, 1);

  const expected = pointsWeight / denominator;
  expectedValueCache.set(key, expected);
  return expected;
}

const balancedFarkleCache = new Map<number, number>();

/** `farkleProbability` for `count` ordinary dice — the baseline every risk comparison is read against. */
export function balancedFarkleProbability(count: number): number {
  const cached = balancedFarkleCache.get(count);
  if (cached !== undefined) {
    return cached;
  }
  const probability = farkleProbability(new Array(count).fill(BALANCED_DIE) as DieSpec[]);
  balancedFarkleCache.set(count, probability);
  return probability;
}

/**
 * How much safer (>1) or riskier (<1) throwing `dice` is versus the same
 * number of ordinary dice. 1 on an all-balanced loadout by construction, so
 * anything scaled by this ratio reduces to its old, pre-M5 behaviour there —
 * see docs/DESIGN.md §6.
 */
export function safetyRatio(dice: readonly DieSpec[]): number {
  if (dice.length === 0) {
    return 1;
  }
  const baseline = 1 - balancedFarkleProbability(dice.length);
  if (baseline === 0) {
    // A single die can't do better than "certain farkle" as a baseline —
    // guards the pathological target(1)=... case; never hit for dice.length
    // >= 1 since a lone balanced die always has a nonzero scoring chance.
    return 1;
  }
  return (1 - farkleProbability(dice)) / baseline;
}
