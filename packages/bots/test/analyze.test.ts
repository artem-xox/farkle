import type { GameEvent } from '@farkle/engine';
import { describe, expect, it } from 'vitest';

import { summarizeMatch } from '../src/analyze.js';

describe('summarizeMatch', () => {
  it('tallies banks, banked points and farkles per player', () => {
    const events: GameEvent[] = [
      { type: 'TurnStarted', player: 0, turn: 1 },
      { type: 'Thrown', player: 0, faces: [1, 2, 3, 4, 5, 6] },
      { type: 'Kept', player: 0, indices: [0], faces: [1], combos: [], points: 100, turnScore: 100 },
      { type: 'Banked', player: 0, points: 100, total: 100 },
      { type: 'TurnEnded', player: 0, next: 1 },
      { type: 'TurnStarted', player: 1, turn: 2 },
      { type: 'Thrown', player: 1, faces: [2, 2, 3, 3, 4, 4] },
      { type: 'Farkled', player: 1, lost: 0 },
      { type: 'TurnEnded', player: 1, next: 0 },
      { type: 'TurnStarted', player: 0, turn: 3 },
      { type: 'Thrown', player: 0, faces: [1, 1, 1, 1, 1, 1] },
      {
        type: 'Kept',
        player: 0,
        indices: [0, 1, 2, 3, 4, 5],
        faces: [1, 1, 1, 1, 1, 1],
        combos: [],
        points: 8000,
        turnScore: 8000,
      },
      { type: 'Banked', player: 0, points: 8000, total: 8100 },
      { type: 'MatchWon', winner: 0, total: 8100 },
    ];

    const summary = summarizeMatch(events, 2);

    expect(summary.winner).toBe(0);
    expect(summary.players[0]).toEqual({ banks: 2, bankedPoints: 8100, farkles: 0 });
    expect(summary.players[1]).toEqual({ banks: 0, bankedPoints: 0, farkles: 1 });
    // Two banks by player 0, one farkle by player 1: three completed turns.
    expect(summary.totalTurns).toBe(3);
  });

  it('handles a player who never gets a turn before the match ends', () => {
    const events: GameEvent[] = [
      { type: 'Banked', player: 0, points: 2000, total: 2000 },
      { type: 'MatchWon', winner: 0, total: 2000 },
    ];
    const summary = summarizeMatch(events, 3);
    expect(summary.players).toHaveLength(3);
    expect(summary.players[1]).toEqual({ banks: 0, bankedPoints: 0, farkles: 0 });
    expect(summary.players[2]).toEqual({ banks: 0, bankedPoints: 0, farkles: 0 });
  });

  it('throws when the log has no MatchWon event', () => {
    const events: GameEvent[] = [{ type: 'Banked', player: 0, points: 100, total: 100 }];
    expect(() => summarizeMatch(events, 2)).toThrow(RangeError);
  });

  it('returns zero totals for an empty log with a winner-only event', () => {
    const events: GameEvent[] = [{ type: 'MatchWon', winner: 1, total: 2000 }];
    const summary = summarizeMatch(events, 2);
    expect(summary.winner).toBe(1);
    expect(summary.totalTurns).toBe(0);
  });
});
