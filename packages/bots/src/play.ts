import {
  reduce,
  viewOf,
  type ClientView,
  type GameAction,
  type GameEvent,
  type GameState,
} from '@farkle/engine';

import type { BotPolicy } from './policy.js';

export interface BotMatchResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/**
 * What a policy would do about the seat's current phase. Exported so a UI
 * that lets a human play one seat and a bot the other (the CLI's
 * `--opponent`, say) can drive the bot's seat one action at a time, using
 * exactly the logic `playBotMatch` uses for every seat.
 */
export function chooseBotAction(view: ClientView, bot: BotPolicy): GameAction {
  if (view.phase === 'AwaitingThrow') {
    return { type: 'Throw' };
  }
  if (view.phase === 'AwaitingKeep') {
    const choice = bot.chooseKeep(view, view.keeps);
    return { type: 'Keep', indices: choice.indices };
  }
  if (view.phase === 'AwaitingBankOrThrow') {
    return bot.decideAfterKeep(view) === 'Bank' ? { type: 'Bank' } : { type: 'Throw' };
  }
  throw new RangeError(`chooseBotAction: no action to take in phase "${view.phase}"`);
}

/**
 * Drives a match to completion with every seat controlled by a bot. Pure
 * apart from whatever internal state the bots themselves keep (a
 * `ThresholdBot`'s mistake rolls, say) — the game transition is `reduce()`,
 * unchanged, and every bot sees only `ClientView`, exactly what a human seat
 * would see.
 */
export function playBotMatch(state: GameState, bots: readonly BotPolicy[]): BotMatchResult {
  if (bots.length !== state.config.players.length) {
    throw new RangeError(
      `match has ${state.config.players.length} players but ${bots.length} bots were given`,
    );
  }

  let current = state;
  const events: GameEvent[] = [];

  while (current.phase !== 'MatchOver') {
    const bot = bots[current.current]!;
    const view = viewOf(current, current.current);
    const action = chooseBotAction(view, bot);

    const result = reduce(current, action);
    current = result.state;
    events.push(...result.events);
  }

  return { state: current, events };
}
