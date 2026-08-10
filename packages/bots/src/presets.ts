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
   * `balanced` with two added risk rules — prototyped and measured in
   * docs/researches/2026-08-10-smart-bot-prototype.md, not yet promoted to
   * "settled" the way the other five are:
   *
   * 1. `bankAt` is target-relative (`bankAtTargetBase`/`bankAtTargetScale`)
   *    instead of the fixed 350 — higher for a short race, lower for a long
   *    one. At the engine's default target (2000) this evaluates to 410,
   *    close to `balanced`'s own 350.
   * 2. `endgameMargin`/`endgameBankAt`: once this bot is within 300 points of
   *    the target itself, it caps its bank threshold at 150 — protecting a
   *    near-certain win instead of gambling for a bigger turn it doesn't need.
   */
  smart: {
    bankAt: 410,
    bankAtTargetBase: 290,
    bankAtTargetScale: 240_000,
    minDiceToThrow: 2,
    diceValue: 15,
    hotDiceAlwaysThrow: true,
    desperationMargin: 200,
    catchUpBonus: 0.5,
    mistakeRate: 0,
    endgameMargin: 300,
    endgameBankAt: 150,
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
