import { DICE_PER_TURN, nextBelow, seedRng, type ClientView, type KeepOption, type RngState } from '@farkle/engine';

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
}

function rankOf(option: KeepOption, params: BotParams): number {
  return option.points + params.diceValue * option.diceLeft;
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
    if (view.diceInPlay < this.params.minDiceToThrow) {
      return 'Bank';
    }

    const opponent = leadingOpponentTotal(view);
    const deficit = Math.max(0, opponent - me.total);
    let threshold = this.params.bankAt + this.params.catchUpBonus * deficit;

    if (opponent >= view.target - this.params.desperationMargin) {
      // A safe partial bank doesn't help if the opponent wins next turn
      // regardless — the only outcome worth playing for is winning outright.
      threshold = Math.max(threshold, view.target - me.total);
    }

    return view.turnScore >= threshold ? 'Bank' : 'Throw';
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
