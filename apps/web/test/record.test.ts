import { describe, expect, it } from 'vitest';

import { MIN_MATCHES_TO_SHOW, summarizeHistory } from '../src/setup/record';
import type { MatchRecord } from '../src/storage';

function match(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    at: 1,
    target: 3000,
    opponent: 'balanced',
    youWon: true,
    yourTotal: 3050,
    opponentTotal: 2400,
    turns: 10,
    yourBestTurn: 400,
    ...overrides,
  };
}

const repeat = (count: number, overrides: Partial<MatchRecord> = {}): MatchRecord[] =>
  Array.from({ length: count }, () => match(overrides));

describe('summarizeHistory', () => {
  it('stays hidden until enough bot matches exist', () => {
    for (let count = 0; count < MIN_MATCHES_TO_SHOW; count++) {
      expect(summarizeHistory(repeat(count), 'balanced')).toBeNull();
    }
    expect(summarizeHistory(repeat(MIN_MATCHES_TO_SHOW), 'balanced')).not.toBeNull();
  });

  it('counts wins and losses against bots', () => {
    const history = [...repeat(3, { youWon: true }), ...repeat(2, { youWon: false })];
    expect(summarizeHistory(history, 'balanced')?.bots).toEqual({ wins: 3, losses: 2 });
  });

  it('excludes pass & play from the bot record, and from the gate', () => {
    // Five hot-seat matches are not three bot matches, so nothing shows yet.
    expect(summarizeHistory(repeat(5, { opponent: null }), 'balanced')).toBeNull();

    const mixed = [...repeat(3, { opponent: 'balanced' }), ...repeat(4, { opponent: null })];
    expect(summarizeHistory(mixed, 'balanced')?.bots).toEqual({ wins: 3, losses: 0 });
  });

  it('narrows the head-to-head to the selected personality', () => {
    const history = [
      ...repeat(2, { opponent: 'aggressive', youWon: false }),
      ...repeat(1, { opponent: 'aggressive', youWon: true }),
      ...repeat(3, { opponent: 'cautious', youWon: true }),
    ];
    expect(summarizeHistory(history, 'aggressive')?.versus).toEqual({ wins: 1, losses: 2 });
    expect(summarizeHistory(history, 'cautious')?.versus).toEqual({ wins: 3, losses: 0 });
  });

  it('has no head-to-head for a personality never played, or none selected', () => {
    const history = repeat(3, { opponent: 'balanced' });
    expect(summarizeHistory(history, 'reckless')?.versus).toBeNull();
    expect(summarizeHistory(history, null)?.versus).toBeNull();
  });

  it('takes the best turn across every match, pass & play included', () => {
    const history = [
      ...repeat(3, { yourBestTurn: 350 }),
      match({ opponent: null, yourBestTurn: 1250 }),
    ];
    expect(summarizeHistory(history, 'balanced')?.bestTurn).toBe(1250);
  });

  it('reports a zero best turn rather than -Infinity when nobody ever banked', () => {
    expect(summarizeHistory(repeat(3, { yourBestTurn: 0 }), 'balanced')?.bestTurn).toBe(0);
  });
});
