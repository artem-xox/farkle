import { BALANCED_DIE, createMatch, DICE_PER_TURN, legalKeeps, type ClientView, type KeepOption } from '@farkle/engine';
import { describe, expect, it } from 'vitest';

import { summarizeMatch } from '../src/analyze.js';
import { chooseBotAction, playBotMatch } from '../src/play.js';
import type { BotPolicy } from '../src/policy.js';
import { createPreset } from '../src/presets.js';
import { fakeView } from './helpers/fake-view.js';

const balancedLoadout = () => new Array(DICE_PER_TURN).fill(BALANCED_DIE);

/** Always takes the best-scoring legal keep and always banks. Wins for sure. */
const bankASAP: BotPolicy = {
  name: 'bank-asap',
  chooseKeep: (_view: ClientView, options: readonly KeepOption[]) => options[0]!,
  decideAfterKeep: () => 'Bank',
};

describe('playBotMatch', () => {
  it('drives a match between two ThresholdBot presets to a clean finish', () => {
    const state = createMatch({
      players: [
        { name: 'Cautious', loadout: balancedLoadout() },
        { name: 'Aggressive', loadout: balancedLoadout() },
      ],
      seed: 20260809,
    });
    const bots = [createPreset('cautious', 1), createPreset('aggressive', 2)];

    const result = playBotMatch(state, bots);

    expect(result.state.phase).toBe('MatchOver');
    expect(result.state.winner).not.toBeNull();
    expect(result.state.totals[result.state.winner!]).toBeGreaterThanOrEqual(
      result.state.config.target,
    );
    // No one else can also be past the target — the match stops the instant
    // someone crosses it.
    result.state.totals.forEach((total, id) => {
      if (id !== result.state.winner) {
        expect(total).toBeLessThan(result.state.config.target);
      }
    });
  });

  it('produces an event log summarizeMatch can read back', () => {
    const state = createMatch({
      players: [
        { name: 'A', loadout: balancedLoadout() },
        { name: 'B', loadout: balancedLoadout() },
      ],
      seed: 7,
      target: 500,
    });
    const result = playBotMatch(state, [bankASAP, bankASAP]);
    const summary = summarizeMatch(result.events, 2);

    expect(summary.winner).toBe(result.state.winner);
    expect(summary.totalTurns).toBeGreaterThan(0);
  });

  it('alternates players correctly and never issues an illegal action', () => {
    // If playBotMatch ever built a Keep action pointing at the wrong dice, or
    // let a bot act out of turn, reduce() would throw — completing cleanly is
    // itself the assertion for a lot of this test.
    const state = createMatch({
      players: [
        { name: 'Novice 1', loadout: balancedLoadout() },
        { name: 'Novice 2', loadout: balancedLoadout() },
      ],
      seed: 99,
      target: 800,
    });
    expect(() =>
      playBotMatch(state, [createPreset('novice', 10), createPreset('novice', 20)]),
    ).not.toThrow();
  });

  it('is deterministic: same match state and bots, same outcome', () => {
    const makeState = () =>
      createMatch({
        players: [
          { name: 'A', loadout: balancedLoadout() },
          { name: 'B', loadout: balancedLoadout() },
        ],
        seed: 555,
      });
    const first = playBotMatch(makeState(), [createPreset('balanced', 3), createPreset('reckless', 4)]);
    const second = playBotMatch(makeState(), [createPreset('balanced', 3), createPreset('reckless', 4)]);
    expect(first.state).toEqual(second.state);
    expect(first.events).toEqual(second.events);
  });

  it('rejects a bot count that does not match the player count', () => {
    const state = createMatch({
      players: [
        { name: 'A', loadout: balancedLoadout() },
        { name: 'B', loadout: balancedLoadout() },
      ],
      seed: 1,
    });
    expect(() => playBotMatch(state, [bankASAP])).toThrow(RangeError);
    expect(() => playBotMatch(state, [bankASAP, bankASAP, bankASAP])).toThrow(RangeError);
  });

  it('finishes within a sane number of turns across many seeds (no infinite-loop regressions)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const state = createMatch({
        players: [
          { name: 'A', loadout: balancedLoadout() },
          { name: 'B', loadout: balancedLoadout() },
        ],
        seed,
        target: 2000,
      });
      const result = playBotMatch(state, [createPreset('aggressive', seed), createPreset('reckless', seed + 1)]);
      // 2000 points at ~500/turn best case is a handful of turns; even with
      // farkles and a slow personality, three digits of turns is a generous cap.
      expect(result.state.turn).toBeLessThan(1000);
    }
  });
});

describe('chooseBotAction', () => {
  const bot = createPreset('balanced', 1);

  it('always throws when nothing has been rolled yet', () => {
    const view = fakeView({ phase: 'AwaitingThrow', thrown: [], keeps: [] });
    expect(chooseBotAction(view, bot)).toEqual({ type: 'Throw' });
  });

  it('asks the policy for a keep and turns it into a Keep action', () => {
    const options = legalKeeps([1, 1, 1, 5, 6, 6]);
    const view = fakeView({ phase: 'AwaitingKeep', thrown: [1, 1, 1, 5, 6, 6], keeps: options });
    const action = chooseBotAction(view, bot);
    expect(action.type).toBe('Keep');
    expect((action as { indices: readonly number[] }).indices).toEqual(
      bot.chooseKeep(view, options).indices,
    );
  });

  it('turns the policy’s bank/throw decision into the matching action', () => {
    const bankView = fakeView({ phase: 'AwaitingBankOrThrow', turnScore: 100_000, target: 100 });
    expect(chooseBotAction(bankView, bot)).toEqual({ type: 'Bank' });

    const throwView = fakeView({ phase: 'AwaitingBankOrThrow', turnScore: 1, diceInPlay: 5, target: 100_000 });
    expect(chooseBotAction(throwView, bot)).toEqual({ type: 'Throw' });
  });

  it('refuses to act once the match is over', () => {
    const view = fakeView({ phase: 'MatchOver' });
    expect(() => chooseBotAction(view, bot)).toThrow(RangeError);
  });
});
