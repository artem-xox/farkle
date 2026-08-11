import { DICE_PER_TURN, nextBelow, seedRng, type ClientView, type KeepOption, type RngState } from '@farkle/engine';

import {
  balancedFarkleProbability,
  expectedKeepValue,
  farkleProbability,
  safetyRatio,
} from './odds.js';
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
  /**
   * Replace the whole `bankAt`/`minDiceToThrow` threshold apparatus with a
   * one-ply expected-value comparison: throw while the expected points from
   * one more throw of the dice actually in play exceed what that throw risks,
   * i.e. `expectedKeepValue(dice) > turnScore * farkleProbability(dice)` (see
   * `expectedKeepValue` for the derivation).
   *
   * This subsumes both thresholds rather than supplementing them. A constant
   * `bankAt` is a fixed guess at where that inequality flips; computing it
   * directly makes the effective threshold rise with the turn score *and*
   * adapt to how many dice are left and how good they are — the last of which
   * no static parameter can express at all.
   *
   * Myopic by construction: it values throwing as "throw once, then bank",
   * ignoring that a good throw earns another decision. That undervalues
   * throwing, so an EV bot banks somewhat earlier than true optimal play
   * would — the exact gap is what a full solver (docs/PLAN.md M6) would close.
   *
   * The race still overrides it: winning outright, hot dice and the
   * desperation rule are all applied before this comparison is reached.
   */
  readonly evBanking?: boolean;
  /**
   * Only meaningful with `evBanking`. `expectedKeepValue` averages over every
   * outcome of the throw, including ones that would overshoot the target by a
   * wide margin — points a bank-outright check already turns into a win, not
   * extra value. This caps the expected gain used in the comparison at
   * `target - me.total - turnScore`, so a large potential overshoot no longer
   * inflates the case for throwing right at the edge of winning outright. An
   * approximation (it caps the *mean*, not each outcome in the distribution
   * that produced it), but a directionally correct one.
   */
  readonly evCapToTarget?: boolean;
  /**
   * Only meaningful with `evBanking`. Scales the expected gain by `1 +
   * evCatchUpTurns * turnsGap`, where `turnsGap` is the leading opponent's
   * lead over this bot, measured in units of a "typical turn" —
   * `expectedKeepValue` of this bot's own six-die loadout thrown fresh, the
   * same primitive the banking rule itself uses, rather than a raw point
   * count that means something different at every target. Positive when
   * behind (more willing to throw), negative when ahead (less willing).
   * Untuned: the sign and rough shape follow from wanting risk tolerance to
   * track race position, but the coefficient itself is a guess pending
   * simulation, same as every other constant in this file.
   */
  readonly evCatchUpTurns?: number;
  /**
   * Replaces `chooseKeep`'s `diceValue`-based ranking with
   * `points + expectedKeepValue(diceLeftSpecs)` — the same "value the dice
   * left behind" idea `rankOf` already encodes, but priced by the actual
   * expected value of throwing them again instead of a hand-tuned constant
   * per die. Falls back to `rankOf` whenever an option carries no die
   * identities to price (`diceLeftSpecs` undefined), the same fallback
   * `rankOf` itself uses for `diceValue`.
   */
  readonly evKeepSelection?: boolean;
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
  if (params.evKeepSelection === true && option.diceLeftSpecs !== undefined) {
    return option.points + expectedKeepValue(option.diceLeftSpecs);
  }
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
    if (this.params.evBanking === true) {
      const decision = this.decideByExpectedValue(view);
      if (decision !== null) {
        return decision;
      }
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

  /**
   * The `evBanking` rule — or `null` when this view carries no die identities
   * to price a throw from, in which case the caller falls back to the
   * threshold path, the same fallback `tooRiskyToThrow` makes.
   */
  private decideByExpectedValue(view: ClientView): 'Throw' | 'Bank' | null {
    if (view.diceInPlay <= 0 || view.inPlayDice.length !== view.diceInPlay) {
      return null;
    }

    const opponent = leadingOpponentTotal(view);
    if (opponent >= view.target - this.params.desperationMargin) {
      // Same reasoning as the threshold path's desperation override: with the
      // opponent a turn away from winning, a bank that doesn't win the game
      // outright is worth nothing, so what the throw risks doesn't matter.
      // Reaching here already implies the turn score can't win (the caller
      // banks first when it can), so the only move left is to throw.
      return 'Throw';
    }

    const dice = view.inPlayDice;
    let gain = expectedKeepValue(dice);

    if (this.params.evCapToTarget === true) {
      const me = view.players[view.you]!;
      // Strictly positive: the caller already banks outright once
      // turnScore alone would clear the target.
      const remaining = view.target - me.total - view.turnScore;
      gain = Math.min(gain, remaining);
    }

    if (this.params.evCatchUpTurns !== undefined && this.params.evCatchUpTurns !== 0) {
      const loadout = view.players[view.you]!.loadout;
      const typicalTurn = loadout.length > 0 ? expectedKeepValue(loadout) : 0;
      if (typicalTurn > 0) {
        const me = view.players[view.you]!;
        const turnsGap = (opponent - me.total) / typicalTurn;
        const multiplier = Math.max(0.1, 1 + this.params.evCatchUpTurns * turnsGap);
        gain *= multiplier;
      }
    }

    return gain > view.turnScore * farkleProbability(dice) ? 'Throw' : 'Bank';
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
