// Shared helpers for the dice-balance scripts. Both consume the *built*
// packages (`npm run build`) via their normal `@farkle/*` package names —
// not `dist/` paths directly — so they keep working if the build output
// moves, and so they exercise exactly what the game ships.
import { bestKeep, hasScoringDice, WILD } from '@farkle/engine';
import { runSimulation, createPreset } from '@farkle/bots';

/**
 * Exact (non-simulated) farkle probability and expected best-keep value for
 * a loadout of dice — which may be six copies of one die or up to six
 * *different* ones — by enumerating every one of the `6^loadout.length`
 * outcomes. This is the same brute force `packages/bots/src/odds.ts` uses
 * for `farkleProbability`, reimplemented here to also get an EV out of the
 * same pass. Cheap regardless of each die's weights: weights only scale a
 * branch's probability, not how many branches exist, so the leaf count stays
 * `6^loadout.length` rather than growing with `total(die)^n`.
 */
export function analyticalMetricsMixed(loadout) {
  const totals = loadout.map((die) => die.weights.reduce((sum, w) => sum + w, 0));
  const denominator = totals.reduce((product, t) => product * t, 1);
  const faces = new Array(loadout.length);
  let farkleWeight = 0;
  let evWeight = 0;

  function recurse(index, weightSoFar) {
    if (index === loadout.length) {
      if (!hasScoringDice(faces)) {
        farkleWeight += weightSoFar;
        return;
      }
      evWeight += weightSoFar * bestKeep(faces).points;
      return;
    }
    const die = loadout[index];
    for (let pipIndex = 0; pipIndex < 6; pipIndex++) {
      const weight = die.weights[pipIndex];
      if (!weight) continue;
      const pip = pipIndex + 1;
      faces[index] = die.wild === pip ? WILD : pip;
      recurse(index + 1, weightSoFar * weight);
    }
  }
  recurse(0, 1);

  return { farkleRate: farkleWeight / denominator, ev: evWeight / denominator };
}

/** `analyticalMetricsMixed` for the common case of `n` copies of one die. */
export function analyticalMetrics(die, n) {
  return analyticalMetricsMixed(new Array(n).fill(die));
}

/**
 * Direct head-to-head win rate between two arbitrary loadouts, both played by
 * the same bot preset (`balanced` by default). Matches a fixed seed so
 * repeat runs at the same `matches` count are reproducible; bump `matches`
 * for a tighter confidence interval rather than changing the seed.
 */
export function winRateHeadToHead(loadoutA, loadoutB, matches, { preset = 'balanced', seed = 987654 } = {}) {
  return runSimulation({
    matches,
    seed,
    loadoutA,
    loadoutB,
    makeA: (s) => createPreset(preset, s),
    makeB: (s) => createPreset(preset, s),
  });
}

/**
 * Win rate of `loadout` (six dice, typically all the same one) against six
 * ordinary dice — the balance metric from docs/DESIGN.md §5. A thin wrapper
 * over `winRateHeadToHead` with the opponent fixed to six `balancedDie`.
 */
export function winRateVsOrdinary(loadout, matches, { balancedDie, seed = 987654 } = {}) {
  return winRateHeadToHead(loadout, new Array(6).fill(balancedDie), matches, { seed });
}

export function formatPercent(fraction, digits = 2) {
  return (fraction * 100).toFixed(digits);
}
