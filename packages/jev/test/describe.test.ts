import { describe, expect, it } from 'vitest';

import { BALANCED_DIE, DEVIL_DIE, KING_DIE, WILD, type DieSpec, type GameEvent } from '@farkle/engine';
import {
  buildState,
  describeDice,
  describeFaces,
  describeHistory,
  faceLabel,
  riskBucket,
} from '@farkle/jev';

import { fakeView } from './helpers/fake-view.js';

const six = (die: DieSpec): DieSpec[] => new Array<DieSpec>(6).fill(die);

describe('faceLabel', () => {
  it('names wildcards rather than printing their sentinels', () => {
    expect(faceLabel(3)).toBe('3');
    expect(faceLabel('W')).toBe("Devil's Head");
    expect(faceLabel('WK')).toBe("King's crown");
    expect(faceLabel('WQ')).toBe("Queen's crown");
  });

  it('reads an empty throw as a word, not as an empty string', () => {
    expect(describeFaces([])).toBe('nothing');
    expect(describeFaces([1, 5, WILD])).toBe("1, 5, Devil's Head");
  });
});

describe('describeDice', () => {
  it('groups by die rather than listing positions', () => {
    expect(describeDice(six(BALANCED_DIE))).toBe('six ordinary dice');
    expect(describeDice([])).toBe('no dice');
    expect(describeDice([BALANCED_DIE])).toBe('one ordinary die');
  });

  it('names each kind when a loadout is mixed', () => {
    const mixed = [DEVIL_DIE, DEVIL_DIE, BALANCED_DIE];
    expect(describeDice(mixed)).toBe("two devil's head dice and one ordinary die");
  });
});

describe('riskBucket', () => {
  /*
   * The bands are the whole point of this function: Jev is documented as
   * weak on raw numbers and better on named buckets, so the name has to be
   * right at each boundary, not merely present.
   */
  it('names each band, with the odds spelled out alongside', () => {
    expect(riskBucket(0.05)).toBe('very low (about 1 in 20)');
    expect(riskBucket(0.2)).toBe('low (about 1 in 5)');
    expect(riskBucket(0.3)).toBe('moderate (about 1 in 3)');
    expect(riskBucket(0.5)).toBe('high (about 1 in 2)');
    expect(riskBucket(0.667)).toBe('very high (about 7 in 10)');
  });

  it('switches from "1 in N" to "N in 10" past even money, where the former reads as certainty', () => {
    // A lone die farkles two throws in three. Rounding 1/0.667 would call
    // that "1 in 1", which says the opposite of what is meant.
    expect(riskBucket(0.55)).toContain('6 in 10');
    expect(riskBucket(0.45)).toContain('1 in 2');
  });

  it('does not claim odds for an impossible bust', () => {
    expect(riskBucket(0)).toBe('very low (never)');
  });
});

describe('describeHistory', () => {
  const events: GameEvent[] = [
    { type: 'TurnStarted', player: 0, turn: 1 },
    { type: 'Thrown', player: 0, faces: [1, 1, 1, 2, 3, 4] },
    {
      type: 'Kept',
      player: 0,
      indices: [0, 1, 2],
      faces: [1, 1, 1],
      combos: [{ kind: 'OfAKind', faces: [1, 1, 1], points: 1000, wilds: 0 }],
      points: 1000,
      turnScore: 1000,
    },
    { type: 'Banked', player: 0, points: 1000, total: 1000 },
    { type: 'TurnEnded', player: 0, next: 1 },
    { type: 'TurnStarted', player: 1, turn: 1 },
    { type: 'Thrown', player: 1, faces: [2, 3, 4, 6, 6, 2] },
    { type: 'Farkled', player: 1, lost: 0 },
  ];

  it('reads back as the story of the match', () => {
    expect(describeHistory(events, ['Jev', 'Henry'])).toEqual([
      'Turn 1: Jev threw 1, 1, 1, 2, 3, 4 and kept 1, 1, 1 for 1000 (three 1s), turn score 1000.',
      'Turn 1: Jev banked 1000, total now 1000.',
      'Turn 1: Henry threw 2, 3, 4, 6, 6, 2, which scores nothing — FARKLE, losing 0.',
    ]);
  });

  it('attributes a throw to the keep or farkle it produced, not to a line of its own', () => {
    // `Thrown` carries no decision, and every line that follows one names the
    // dice anyway — so it costs length without adding information.
    expect(describeHistory(events, ['Jev', 'Henry']).some((line) => line.includes('threw'))).toBe(true);
    expect(describeHistory([events[1]!], ['Jev', 'Henry'])).toEqual([]);
  });
});

describe('buildState', () => {
  it('carries the rules, the standings and the throw in front of you', () => {
    const view = fakeView({
      thrown: [1, 5, 5, 2, 3, 4],
      turnScore: 300,
      players: [
        { id: 0, name: 'Jev', total: 1200, loadout: six(KING_DIE) },
        { id: 1, name: 'Henry', total: 1600, loadout: six(BALANCED_DIE) },
      ],
    });

    const state = buildState(view, ['Turn 1: Henry banked 600, total now 600.']) as Record<
      string,
      Record<string, unknown>
    >;

    expect(String(state['rules'])).toContain('FARKLE');
    expect(state['match']['standing']).toBe('you trail Henry by 400');
    expect((state['match']['you'] as Record<string, string>)['still_needs']).toBe('800 to win');
    expect(state['this_turn']['the_throw_in_front_of_you']).toBe('1, 5, 5, 2, 3, 4');
    expect(state['this_turn']['turn_score_so_far']).toBe('300 points, all of it lost if you farkle');
    expect(state['history']).toEqual(['Turn 1: Henry banked 600, total now 600.']);
  });

  it('never claims a player needs a negative number of points to win', () => {
    const view = fakeView({
      players: [
        { id: 0, name: 'Jev', total: 2200, loadout: six(BALANCED_DIE) },
        { id: 1, name: 'Henry', total: 0, loadout: six(BALANCED_DIE) },
      ],
    });
    const state = buildState(view, []) as Record<string, Record<string, Record<string, string>>>;
    expect(state['match']!['you']!['still_needs']).toBe('0 to win');
  });

  it('drops the oldest history and says how much, rather than truncating silently', () => {
    const history = Array.from({ length: 400 }, (_, index) => `Turn ${index}: a line of match history.`);
    const state = buildState(fakeView(), history, [], { maxChars: 6000 }) as Record<string, unknown>;
    const kept = state['history'] as string[];

    expect(kept.length).toBeLessThan(history.length);
    expect(kept[0]).toMatch(/^\(\d+ earlier entries omitted/);
    // What survives is the recent end — the turns that still bear on this decision.
    expect(kept[kept.length - 1]).toBe(history[history.length - 1]);
    expect(JSON.stringify(state).length).toBeLessThanOrEqual(6000 + String(state['rules'] ?? '').length);
  });

  it('keeps the whole history when it fits, which is the normal case', () => {
    const history = Array.from({ length: 40 }, (_, index) => `Turn ${index}: a line of match history.`);
    const state = buildState(fakeView(), history) as Record<string, unknown>;
    expect(state['history']).toEqual(history);
  });
});
