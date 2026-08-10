import { DICE_PER_TURN, nextBelow, seedRng, type ClientView, type KeepOption, type RngState } from '@farkle/engine';

import { balancedFarkleProbability, farkleProbability, safetyRatio } from './odds.js';
import type { BotPolicy } from './policy.js';

/**
 * The whole personality range in one policy — see docs/DESIGN.md §6 for the
 * reasoning and the preset table each parameter feeds into (presets.ts).
 */
export interface BotParams {
  /** Bank once the turn score reaches this, absent other pressure. */
  readonly bankAt: number;
  /** Refuse to throw with fewer dice in play than this — banks instead. */
  readonly minDiceToThrow: number;
  /**
   * Points a bot will forgo to leave one more die in play. Positive values
   * bias `chooseKeep` toward partial keeps that hoard dice; zero is pure
   * greed; negative values actively prefer keeps that empty the board.
   */
  readonly diceValue: number;
  /** Ignore every other consideration and throw again after hot dice. */
  readonly hotDiceAlwaysThrow: boolean;
  /**
   * Once the leading opponent is within this many points of the target, a
   * safe partial bank stops mattering — see `decideAfterKeep` for why.
   */
  readonly desperationMargin: number;
  /** Extra bank threshold per point behind the leading opponent. */
  readonly catchUpBonus: number;
  /** Chance of deliberately taking a worse-than-best legal keep. */
  readonly mistakeRate: number;
  /**
   * When both are set, `bankAt` is ignored in favour of a threshold derived
   * from the match's own victory target: `bankAtTargetBase +
   * bankAtTargetScale / target`, clamped to `[BANK_AT_MIN, BANK_AT_MAX]`. A
   * fixed `bankAt` is calibrated for one target; this makes the threshold
   * higher for a short race (where a single big turn matters more) and lower
   * for a long one (where consistency compounds) — see
   * docs/researches/2026-08-10-smart-bot-prototype.md.
   */
  readonly bankAtTargetBase?: number;
  readonly bankAtTargetScale?: number;
  /**
   * Once this bot's own remaining distance to the target drops to
   * `endgameMargin` or below, cap the bank threshold at `endgameBankAt` —
   * there is no reward for stacking turn score past what's needed to win, and
   * every extra throw beyond the minimum is pure risk to a lead that's
   * already nearly secured. Applied before `desperationMargin`'s override, so
   * a genuinely must-win turn (opponent close to the target too) still takes
   * priority over playing it safe.
   */
  readonly endgameMargin?: number;
  readonly endgameBankAt?: number;
}

/**
 * Bounds for `bankAtTargetBase + bankAtTargetScale / target`, matching the
 * lowest (`cautious`) and highest (`aggressive`) static `bankAt` in the
 * roster — the dynamic threshold is meant to slide within the range already
 * measured to be sane, not explore outside it.
 */
const BANK_AT_MIN = 200;
const BANK_AT_MAX = 600;

/**
 * `points + diceValue * diceLeft`, same as always, except the dice-hoarding
 * term is scaled by how much safer (or riskier) the specific dice left
 * behind are than an equal number of ordinary ones — see
 * `packages/bots/src/odds.ts`. `safetyRatio` is exactly 1 on an all-balanced
 * loadout, so this is a strict extension of the M2 formula: nothing changes
 * for a bot that never sees a die outside `DICE.balanced`. Skipped whenever
 * it can't matter (`diceValue` is 0) or can't be computed (`legalKeeps` was
 * called without die identities, as some tests do directly).
 */
function rankOf(option: KeepOption, params: BotParams): number {
  if (params.diceValue === 0 || option.diceLeft === 0 || option.diceLeftSpecs === undefined) {
    return option.points + params.diceValue * option.diceLeft;
  }
  return option.points + params.diceValue * option.diceLeft * safetyRatio(option.diceLeftSpecs);
}

function leadingOpponentTotal(view: ClientView): number {
  let best = 0;
  for (const player of view.players) {
    if (player.id !== view.you) {
      best = Math.max(best, player.total);
    }
  }
  return best;
}

/**
 * One parameterised policy standing in for five personalities. Holds its own
 * PRNG state for mistake rolls — separate from the match's `GameState.rng`,
 * since a bot's second-guessing isn't part of the game's replayable state, only
 * of how a particular action got chosen.
 */
export class ThresholdBot implements BotPolicy {
  readonly name: string;
  private readonly params: BotParams;
  private rng: RngState;

  constructor(name: string, params: BotParams, seed: number) {
    this.name = name;
    this.params = params;
    this.rng = seedRng(seed);
  }

  chooseKeep(_view: ClientView, options: readonly KeepOption[]): KeepOption {
    if (options.length === 0) {
      throw new RangeError(`${this.name}: chooseKeep called with no legal keeps`);
    }

    const ranked = [...options].sort(
      (a, b) => rankOf(b, this.params) - rankOf(a, this.params) || a.faces.join('').localeCompare(b.faces.join('')),
    );

    if (this.params.mistakeRate > 0 && ranked.length > 1 && this.unitRoll() < this.params.mistakeRate) {
      // A deliberate mistake: anything but the top-ranked option, uniformly.
      const index = 1 + this.rollBelow(ranked.length - 1);
      return ranked[index]!;
    }
    return ranked[0]!;
  }

  decideAfterKeep(view: ClientView): 'Throw' | 'Bank' {
    const me = view.players[view.you]!;

    if (me.total + view.turnScore >= view.target) {
      return 'Bank';
    }
    if (view.diceInPlay === DICE_PER_TURN && this.params.hotDiceAlwaysThrow) {
      return 'Throw';
    }
    if (this.tooRiskyToThrow(view)) {
      return 'Bank';
    }

    const opponent = leadingOpponentTotal(view);
    const deficit = Math.max(0, opponent - me.total);
    const bankAt = this.effectiveBankAt(view.target);
    let threshold = bankAt + this.params.catchUpBonus * deficit;

    if (this.params.endgameMargin !== undefined && this.params.endgameBankAt !== undefined) {
      const remaining = view.target - me.total;
      if (remaining <= this.params.endgameMargin) {
        threshold = Math.min(threshold, this.params.endgameBankAt);
      }
    }

    if (opponent >= view.target - this.params.desperationMargin) {
      // A safe partial bank doesn't help if the opponent wins next turn
      // regardless — the only outcome worth playing for is winning outright.
      threshold = Math.max(threshold, view.target - me.total);
    }

    return view.turnScore >= threshold ? 'Bank' : 'Throw';
  }

  /** `params.bankAt`, or the target-relative threshold when configured — see `bankAtTargetBase`. */
  private effectiveBankAt(target: number): number {
    if (this.params.bankAtTargetBase === undefined || this.params.bankAtTargetScale === undefined) {
      return this.params.bankAt;
    }
    const raw = this.params.bankAtTargetBase + this.params.bankAtTargetScale / target;
    return Math.min(BANK_AT_MAX, Math.max(BANK_AT_MIN, raw));
  }

  /**
   * `minDiceToThrow` read as a farkle-risk ceiling rather than a bare count:
   * refuse to throw once the actual dice in play are riskier than
   * `minDiceToThrow` ordinary dice would be. A loadout with a Devil's Head
   * left in play can therefore be thrown below the old raw-count floor, and a
   * loadout of only cheat dice can be refused above it.
   *
   * Falls back to the plain count check whenever `view.inPlayDice` doesn't
   * actually describe `view.diceInPlay` dice — which is every `ClientView`
   * built by hand rather than by `viewOf` (`fakeView` in tests defaults to no
   * dice at all), since there is then no die identity to price risk from.
   */
  private tooRiskyToThrow(view: ClientView): boolean {
    if (view.diceInPlay > 0 && view.inPlayDice.length === view.diceInPlay) {
      const ceiling = balancedFarkleProbability(this.params.minDiceToThrow);
      return farkleProbability(view.inPlayDice) > ceiling;
    }
    return view.diceInPlay < this.params.minDiceToThrow;
  }

  /** Uniform [0, 1). */
  private unitRoll(): number {
    const precision = 1_000_000;
    const result = nextBelow(this.rng, precision);
    this.rng = result.state;
    return result.value / precision;
  }

  /** Uniform integer in [0, bound). */
  private rollBelow(bound: number): number {
    const result = nextBelow(this.rng, bound);
    this.rng = result.state;
    return result.value;
  }
}
