// Shared helpers for the dice-balance scripts. Both consume the *built*
// packages (`npm run build`) via their normal `@farkle/*` package names —
// not `dist/` paths directly — so they keep working if the build output
// moves, and so they exercise exactly what the game ships.
import { bestKeep, hasScoringDice, WILD } from '@farkle/engine';
import { runSimulation, createPreset } from '@farkle/bots';

/**
 * Exact (non-simulated) farkle probability and expected best-keep value for
 * `n` copies of `die`, by enumerating every one of the `total(die)^n`
 * outcomes. This is the same brute force `packages/bots/src/odds.ts` uses
 * for `farkleProbability`, reimplemented here to also get an EV out of the
 * same pass — cheap for n <= 6.
 */
export function analyticalMetrics(die, n) {
  const total = die.weights.reduce((sum, w) => sum + w, 0);
  const denominator = total ** n;
  const faces = new Array(n);
  let farkleWeight = 0;
  let evWeight = 0;

  function recurse(index, weightSoFar) {
    if (index === n) {
      if (!hasScoringDice(faces)) {
        farkleWeight += weightSoFar;
        return;
      }
      evWeight += weightSoFar * bestKeep(faces).points;
      return;
    }
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

/**
 * Win rate of `loadout` (six dice, typically all the same one) against six
 * ordinary dice, both sides played by the `balanced` bot preset — the
 * balance metric from docs/DESIGN.md §5. Matches a fixed seed so repeat runs
 * at the same `matches` count are reproducible; bump `matches` for a
 * tighter confidence interval rather than changing the seed.
 */
export function winRateVsOrdinary(loadout, matches, { balancedDie, seed = 987654 } = {}) {
  const baseline = new Array(6).fill(balancedDie);
  return runSimulation({
    matches,
    seed,
    loadoutA: loadout,
    loadoutB: baseline,
    makeA: (s) => createPreset('balanced', s),
    makeB: (s) => createPreset('balanced', s),
  });
}

export function formatPercent(fraction, digits = 2) {
  return (fraction * 100).toFixed(digits);
}
