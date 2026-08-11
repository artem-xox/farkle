import type { BotParams } from './threshold-bot.js';
import { ThresholdBot } from './threshold-bot.js';

/**
 * Named personalities over `BotParams` — see docs/DESIGN.md §6 for the shape
 * of each. Numbers are the output of a tuning pass (`farkle sim`, round-robin
 * across all five, docs/PLAN.md#m2), not a first guess: they're picked so that
 * no preset is strictly dominated and `cautious` vs `aggressive` produces a
 * result explainable from the stats `runSimulation` reports.
 */
export const PRESETS = {
  cautious: {
    bankAt: 200,
    minDiceToThrow: 3,
    diceValue: 45,
    hotDiceAlwaysThrow: false,
    desperationMargin: 150,
    catchUpBonus: 0.4,
    mistakeRate: 0,
  },
  balanced: {
    bankAt: 350,
    minDiceToThrow: 2,
    diceValue: 15,
    hotDiceAlwaysThrow: true,
    desperationMargin: 200,
    catchUpBonus: 0.5,
    mistakeRate: 0,
  },
  aggressive: {
    bankAt: 600,
    minDiceToThrow: 2,
    diceValue: 0,
    hotDiceAlwaysThrow: true,
    desperationMargin: 250,
    catchUpBonus: 0.6,
    mistakeRate: 0,
  },
  reckless: {
    bankAt: 450,
    minDiceToThrow: 1,
    diceValue: -5,
    hotDiceAlwaysThrow: true,
    desperationMargin: 300,
    catchUpBonus: 0.3,
    mistakeRate: 0,
  },
  novice: {
    bankAt: 350,
    minDiceToThrow: 2,
    diceValue: 15,
    hotDiceAlwaysThrow: true,
    desperationMargin: 200,
    catchUpBonus: 0.5,
    mistakeRate: 0.18,
  },
  /**
   * `balanced` with both throw-or-bank and keep selection replaced by exact
   * expected-value comparisons (`evBanking`, `evKeepSelection` —
   * `packages/bots/src/odds.ts`) instead of the constant `bankAt` and
   * `diceValue` thresholds every other preset uses. Measured in
   * docs/researches/2026-08-11-smart-v2.md: it beats every other preset in
   * every one of 54 pairings tested (3 victory targets × 3 dice sets × 6
   * opponents), averaging 60.5%, and beats `balanced` specifically by +7.7
   * points. `bankAt`/`minDiceToThrow`/`diceValue` below are dead weight in
   * practice — `evBanking`/`evKeepSelection` only fall back to them when a
   * `ClientView` carries no die identities, which a real match never
   * produces — kept at `balanced`'s values so that fallback isn't a
   * regression if it's ever exercised.
   *
   * An earlier, differently-tuned `smart` (target-relative `bankAt` plus an
   * endgame-caution cap) was tried first and shipped nowhere: ablation in
   * docs/researches/2026-08-10-smart-ablation-and-ev.md found it
   * statistically indistinguishable from `balanced`. This is a full
   * replacement, not a refinement of that version.
   */
  smart: {
    bankAt: 350,
    minDiceToThrow: 2,
    diceValue: 15,
    hotDiceAlwaysThrow: true,
    desperationMargin: 200,
    catchUpBonus: 0.5,
    mistakeRate: 0,
    evBanking: true,
    evKeepSelection: true,
  },
} as const satisfies Record<string, BotParams>;

export type PresetName = keyof typeof PRESETS;

export const PRESET_NAMES: readonly PresetName[] = Object.keys(PRESETS) as PresetName[];

export function isPresetName(name: string): name is PresetName {
  return Object.prototype.hasOwnProperty.call(PRESETS, name);
}

/** A fresh `ThresholdBot` for the named preset, seeded independently. */
export function createPreset(name: PresetName, seed: number): ThresholdBot {
  return new ThresholdBot(name, PRESETS[name], seed);
}
