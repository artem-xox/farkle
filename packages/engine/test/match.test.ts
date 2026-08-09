import { describe, expect, it } from 'vitest';

import { BALANCED_DIE } from '../src/dice.js';
import {
  createMatch,
  IllegalActionError,
  reduce,
  replay,
  validateAction,
  type GameAction,
  type GameEvent,
  type GameState,
  type MatchOptions,
  type PlayerConfig,
} from '../src/match.js';
import { bestKeep } from '../src/scoring.js';
import { DICE_PER_TURN } from '../src/types.js';
import { loadout } from './helpers/fixed-dice.js';

const balanced = (name: string): PlayerConfig => ({
  name,
  loadout: new Array(DICE_PER_TURN).fill(BALANCED_DIE),
});

const fixed = (name: string, faces: string): PlayerConfig => ({ name, loadout: loadout(faces) });

const kinds = (events: readonly GameEvent[]): string[] => events.map((event) => event.type);

function apply(state: GameState, ...actions: GameAction[]): { state: GameState; events: GameEvent[] } {
  let current = state;
  const events: GameEvent[] = [];
  for (const action of actions) {
    const result = reduce(current, action);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

describe('createMatch', () => {
  it('starts the configured player with six dice and nothing banked', () => {
    const state = createMatch({ players: [balanced('A'), balanced('B')], seed: 1 });
    expect(state.phase).toBe('AwaitingThrow');
    expect(state.current).toBe(0);
    expect(state.totals).toEqual([0, 0]);
    expect(state.turn).toBe(1);
    expect(state.turnScore).toBe(0);
    expect(state.inPlay).toEqual([0, 1, 2, 3, 4, 5]);
    expect(state.thrown).toEqual([]);
    expect(state.winner).toBeNull();
    expect(state.config.target).toBe(2000);
  });

  it('honours a non-default starting player and target', () => {
    const state = createMatch({
      players: [balanced('A'), balanced('B'), balanced('C')],
      seed: 1,
      target: 4000,
      startingPlayer: 2,
    });
    expect(state.current).toBe(2);
    expect(state.config.target).toBe(4000);
  });

  it('rejects malformed configurations', () => {
    expect(() => createMatch({ players: [balanced('A')], seed: 1 })).toThrow(RangeError);
    expect(() =>
      createMatch({ players: [fixed('A', '111'), balanced('B')], seed: 1 }),
    ).toThrow(/expected 6/);
    expect(() =>
      createMatch({ players: [balanced('A'), balanced('B')], seed: 1, target: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      createMatch({ players: [balanced('A'), balanced('B')], seed: 1, startingPlayer: 5 }),
    ).toThrow(RangeError);
  });
});

describe('the turn', () => {
  it('throws, keeps, and banks', () => {
    // 1 2 3 4 6 6 — only the single 1 scores.
    const state = createMatch({ players: [fixed('A', '123466'), balanced('B')], seed: 1 });

    const thrown = reduce(state, { type: 'Throw' });
    expect(kinds(thrown.events)).toEqual(['Thrown']);
    expect(thrown.state.phase).toBe('AwaitingKeep');
    expect(thrown.state.thrown).toEqual([1, 2, 3, 4, 6, 6]);

    const kept = reduce(thrown.state, { type: 'Keep', indices: [0] });
    expect(kinds(kept.events)).toEqual(['Kept']);
    expect(kept.state.turnScore).toBe(100);
    expect(kept.state.phase).toBe('AwaitingBankOrThrow');
    expect(kept.state.inPlay).toEqual([1, 2, 3, 4, 5]);
    expect(kept.state.thrown).toEqual([]);
    expect(kept.state.keptThisTurn).toEqual([1]);

    const banked = reduce(kept.state, { type: 'Bank' });
    expect(kinds(banked.events)).toEqual(['Banked', 'TurnEnded', 'TurnStarted']);
    expect(banked.state.totals).toEqual([100, 0]);
    expect(banked.state.current).toBe(1);
    expect(banked.state.turn).toBe(2);
    expect(banked.state.turnScore).toBe(0);
    expect(banked.state.phase).toBe('AwaitingThrow');
  });

  it('loses the turn score to a farkle and passes play on', () => {
    // 1 2 3 4 6 6: keep the 1, then 2 3 4 6 6 has nothing at all.
    const state = createMatch({ players: [fixed('A', '123466'), balanced('B')], seed: 1 });
    const beforeFarkle = apply(state, { type: 'Throw' }, { type: 'Keep', indices: [0] });
    expect(beforeFarkle.state.turnScore).toBe(100);

    const result = reduce(beforeFarkle.state, { type: 'Throw' });
    expect(kinds(result.events)).toEqual(['Thrown', 'Farkled', 'TurnEnded', 'TurnStarted']);

    const farkled = result.events.find((event) => event.type === 'Farkled');
    expect(farkled).toMatchObject({ player: 0, lost: 100 });
    expect(result.state.totals).toEqual([0, 0]);
    expect(result.state.current).toBe(1);
    expect(result.state.turnScore).toBe(0);
  });

  it('farkles on the opening throw without losing anything', () => {
    const state = createMatch({ players: [fixed('A', '223344'), balanced('B')], seed: 1 });
    const result = reduce(state, { type: 'Throw' });
    expect(kinds(result.events)).toEqual(['Thrown', 'Farkled', 'TurnEnded', 'TurnStarted']);
    expect(result.events.find((event) => event.type === 'Farkled')).toMatchObject({ lost: 0 });
    expect(result.state.current).toBe(1);
  });

  it('returns all six dice on hot dice and carries the turn score', () => {
    const state = createMatch({
      players: [fixed('A', '111111'), balanced('B')],
      seed: 1,
      target: 100_000,
    });

    const first = apply(state, { type: 'Throw' }, { type: 'Keep', indices: [0, 1, 2, 3, 4, 5] });
    expect(kinds(first.events)).toEqual(['Thrown', 'Kept', 'HotDice']);
    expect(first.state.turnScore).toBe(8000);
    expect(first.state.inPlay).toHaveLength(DICE_PER_TURN);
    expect(first.state.phase).toBe('AwaitingBankOrThrow');

    const second = apply(first.state, { type: 'Throw' }, { type: 'Keep', indices: [0, 1, 2, 3, 4, 5] });
    expect(second.state.turnScore).toBe(16_000);
    expect(second.state.keptThisTurn).toHaveLength(12);
  });

  it('lets a player bank instead of taking the hot-dice throw', () => {
    const state = createMatch({
      players: [fixed('A', '111111'), balanced('B')],
      seed: 1,
      target: 100_000,
    });
    const result = apply(
      state,
      { type: 'Throw' },
      { type: 'Keep', indices: [0, 1, 2, 3, 4, 5] },
      { type: 'Bank' },
    );
    expect(result.state.totals).toEqual([8000, 0]);
    expect(result.state.current).toBe(1);
  });

  it('scores a partial keep and leaves the rest in play', () => {
    // 1 1 1 5 6 6 — keeping only two ones is legal and leaves four dice.
    const state = createMatch({ players: [fixed('A', '111566'), balanced('B')], seed: 1 });
    const result = apply(state, { type: 'Throw' }, { type: 'Keep', indices: [0, 1] });
    expect(result.state.turnScore).toBe(200);
    expect(result.state.inPlay).toEqual([2, 3, 4, 5]);
  });
});

describe('winning', () => {
  it('ends the match the moment a bank reaches the target', () => {
    const state = createMatch({ players: [fixed('A', '111111'), balanced('B')], seed: 1 });
    const result = apply(
      state,
      { type: 'Throw' },
      { type: 'Keep', indices: [0, 1, 2, 3, 4, 5] },
      { type: 'Bank' },
    );
    expect(kinds(result.events)).toEqual(['Thrown', 'Kept', 'HotDice', 'Banked', 'MatchWon']);
    expect(result.state.phase).toBe('MatchOver');
    expect(result.state.winner).toBe(0);
    expect(result.state.totals).toEqual([8000, 0]);
  });

  it('does not win on turn score alone', () => {
    const state = createMatch({ players: [fixed('A', '111111'), balanced('B')], seed: 1 });
    const result = apply(state, { type: 'Throw' }, { type: 'Keep', indices: [0, 1, 2, 3, 4, 5] });
    expect(result.state.turnScore).toBe(8000);
    expect(result.state.winner).toBeNull();
    expect(result.state.phase).toBe('AwaitingBankOrThrow');
  });

  it('refuses every action once the match is over', () => {
    const state = createMatch({ players: [fixed('A', '111111'), balanced('B')], seed: 1 });
    const over = apply(
      state,
      { type: 'Throw' },
      { type: 'Keep', indices: [0, 1, 2, 3, 4, 5] },
      { type: 'Bank' },
    ).state;

    for (const action of [
      { type: 'Throw' },
      { type: 'Bank' },
      { type: 'Keep', indices: [0] },
    ] satisfies GameAction[]) {
      expect(validateAction(over, action)).toBe('the match is over');
      expect(() => reduce(over, action)).toThrow(IllegalActionError);
    }
  });
});

describe('illegal actions', () => {
  const opening = () => createMatch({ players: [fixed('A', '123466'), balanced('B')], seed: 1 });

  it('will not bank before a scoring die is kept', () => {
    const state = opening();
    expect(validateAction(state, { type: 'Bank' })).toMatch(/before banking/);
    expect(() => reduce(state, { type: 'Bank' })).toThrow(IllegalActionError);
  });

  it('will not throw again with dice still on the table', () => {
    const state = reduce(opening(), { type: 'Throw' }).state;
    expect(validateAction(state, { type: 'Throw' })).toMatch(/before throwing again/);
  });

  it('will not keep when there are no dice on the table', () => {
    expect(validateAction(opening(), { type: 'Keep', indices: [0] })).toMatch(/no dice on the table/);
  });

  it('rejects empty, duplicated, out-of-range and non-scoring selections', () => {
    const state = reduce(opening(), { type: 'Throw' }).state; // 1 2 3 4 6 6
    expect(validateAction(state, { type: 'Keep', indices: [] })).toMatch(/at least one die/);
    expect(validateAction(state, { type: 'Keep', indices: [0, 0] })).toMatch(/twice/);
    expect(validateAction(state, { type: 'Keep', indices: [6] })).toMatch(/no die at position 7/);
    expect(validateAction(state, { type: 'Keep', indices: [-1] })).toMatch(/no die at position 0/);
    expect(validateAction(state, { type: 'Keep', indices: [1] })).toMatch(/scoring combination/);
    expect(validateAction(state, { type: 'Keep', indices: [0, 1] })).toMatch(/scoring combination/);
    expect(validateAction(state, { type: 'Keep', indices: [0] })).toBeNull();
  });
});

describe('purity', () => {
  it('does not mutate the state it is given', () => {
    const state = createMatch({ players: [fixed('A', '111566'), balanced('B')], seed: 7 });
    const snapshot = JSON.stringify(state);
    const thrown = reduce(state, { type: 'Throw' });
    reduce(thrown.state, { type: 'Keep', indices: [0, 1, 2] });
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('gives the same result for the same input', () => {
    const state = createMatch({ players: [balanced('A'), balanced('B')], seed: 99 });
    expect(reduce(state, { type: 'Throw' })).toEqual(reduce(state, { type: 'Throw' }));
  });
});

/** Keeps the highest-scoring option and banks at 300. Enough to drive a match. */
function playOut(options: MatchOptions, actionCap = 5000): { log: GameAction[]; state: GameState } {
  let state = createMatch(options);
  const log: GameAction[] = [];

  while (state.phase !== 'MatchOver') {
    if (log.length >= actionCap) {
      throw new Error('match did not finish within the action cap');
    }
    let action: GameAction;
    if (state.phase === 'AwaitingKeep') {
      action = { type: 'Keep', indices: bestKeep(state.thrown)!.indices };
    } else if (state.phase === 'AwaitingBankOrThrow' && state.turnScore >= 300) {
      action = { type: 'Bank' };
    } else {
      action = { type: 'Throw' };
    }
    log.push(action);
    state = reduce(state, action).state;
  }

  return { log, state };
}

describe('replay', () => {
  const options: MatchOptions = { players: [balanced('A'), balanced('B')], seed: 20260809 };

  it('reproduces a full match exactly from its seed and action log', () => {
    const played = playOut(options);
    const replayed = replay({ options, actions: played.log });
    expect(replayed.state).toEqual(played.state);
  });

  it('produces an identical event log every time', () => {
    const played = playOut(options);
    const first = replay({ options, actions: played.log });
    const second = replay({ options, actions: played.log });
    expect(first.events).toEqual(second.events);
    expect(first.events.length).toBeGreaterThan(10);
  });

  it('plays out differently under a different seed', () => {
    const a = playOut(options);
    const b = playOut({ ...options, seed: options.seed + 1 });
    expect(b.log).not.toEqual(a.log);
  });

  it('finishes with a winner at or past the target', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { state } = playOut({ ...options, seed });
      expect(state.winner).not.toBeNull();
      expect(state.totals[state.winner!]).toBeGreaterThanOrEqual(state.config.target);
      // Nobody else can have crossed it, since the match stops on the winning bank.
      const others = state.totals.filter((_, id) => id !== state.winner);
      for (const total of others) {
        expect(total).toBeLessThan(state.config.target);
      }
    }
  });
});
