import { describe, expect, it, vi } from 'vitest';

import { BALANCED_DIE } from '../src/dice.js';
import { LocalHost, viewOf } from '../src/host.js';
import { createMatch, IllegalActionError, type GameEvent, type PlayerConfig } from '../src/match.js';
import { DICE_PER_TURN } from '../src/types.js';
import { loadout } from './helpers/fixed-dice.js';

const balanced = (name: string): PlayerConfig => ({
  name,
  loadout: new Array(DICE_PER_TURN).fill(BALANCED_DIE),
});

const fixed = (name: string, faces: string): PlayerConfig => ({ name, loadout: loadout(faces) });

const newHost = () =>
  new LocalHost(createMatch({ players: [fixed('Alice', '111566'), balanced('Bob')], seed: 3 }));

describe('client view', () => {
  it('describes the match from one player’s seat', () => {
    const host = newHost();
    const view = host.view(1);

    expect(view.you).toBe(1);
    expect(view.current).toBe(0);
    expect(view.yourTurn).toBe(false);
    expect(view.players.map((player) => player.name)).toEqual(['Alice', 'Bob']);
    expect(view.players.map((player) => player.total)).toEqual([0, 0]);
    expect(view.target).toBe(2000);
    expect(view.diceInPlay).toBe(DICE_PER_TURN);
    expect(view.thrown).toEqual([]);
    expect(view.keeps).toEqual([]);
  });

  it('offers legal keeps only while dice are on the table', () => {
    const host = newHost();
    expect(host.view(0).keeps).toHaveLength(0);

    void host.dispatch(0, { type: 'Throw' });
    const view = host.view(0);
    expect(view.thrown).toEqual([1, 1, 1, 5, 6, 6]);
    expect(view.yourTurn).toBe(true);
    expect(view.keeps.length).toBeGreaterThan(0);
    expect(view.keeps[0]?.points).toBe(1050);
    for (const keep of view.keeps) {
      expect([...keep.faces]).toEqual(keep.indices.map((index) => view.thrown[index]));
    }
  });

  it('reports no current turn once the match is over', () => {
    const host = new LocalHost(
      createMatch({ players: [fixed('Alice', '111111'), balanced('Bob')], seed: 3 }),
    );
    void host.dispatch(0, { type: 'Throw' });
    void host.dispatch(0, { type: 'Keep', indices: [0, 1, 2, 3, 4, 5] });
    void host.dispatch(0, { type: 'Bank' });

    const view = host.view(0);
    expect(view.phase).toBe('MatchOver');
    expect(view.winner).toBe(0);
    expect(view.yourTurn).toBe(false);
  });

  it('is a projection, not the state itself', () => {
    const state = createMatch({ players: [balanced('A'), balanced('B')], seed: 1 });
    expect(viewOf(state, 0)).not.toHaveProperty('rng');
    expect(viewOf(state, 0)).not.toHaveProperty('config');
  });
});

describe('dispatch', () => {
  it('refuses actions from a player whose turn it is not', async () => {
    const host = newHost();
    await expect(host.dispatch(1, { type: 'Throw' })).rejects.toThrow(IllegalActionError);
    expect(host.state.phase).toBe('AwaitingThrow');
  });

  it('propagates illegal actions from the engine and leaves the state untouched', async () => {
    const host = newHost();
    const before = host.state;
    await expect(host.dispatch(0, { type: 'Bank' })).rejects.toThrow(IllegalActionError);
    expect(host.state).toBe(before);
  });

  it('advances the state it holds', async () => {
    const host = newHost();
    await host.dispatch(0, { type: 'Throw' });
    expect(host.state.phase).toBe('AwaitingKeep');
  });
});

describe('subscriptions', () => {
  it('delivers the events of each action in order', async () => {
    const host = newHost();
    const seen: GameEvent[] = [];
    host.subscribe((events) => seen.push(...events));

    await host.dispatch(0, { type: 'Throw' });
    await host.dispatch(0, { type: 'Keep', indices: [0, 1, 2] });
    await host.dispatch(0, { type: 'Bank' });

    expect(seen.map((event) => event.type)).toEqual([
      'Thrown',
      'Kept',
      'Banked',
      'TurnEnded',
      'TurnStarted',
    ]);
  });

  it('stops delivering after unsubscribing', async () => {
    const host = newHost();
    const listener = vi.fn();
    const unsubscribe = host.subscribe(listener);

    await host.dispatch(0, { type: 'Throw' });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await host.dispatch(0, { type: 'Keep', indices: [0] });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies every listener', async () => {
    const host = newHost();
    const first = vi.fn();
    const second = vi.fn();
    host.subscribe(first);
    host.subscribe(second);

    await host.dispatch(0, { type: 'Throw' });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
