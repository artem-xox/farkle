import { describe, expect, it } from 'vitest';

import {
  BALANCED_DIE,
  DEVIL_DIE,
  KING_DIE,
  legalKeeps,
  QUEEN_DIE,
  WILD,
  WILD_KING,
  WILD_QUEEN,
  type DieSpec,
  type Face,
} from '@farkle/engine';
import { balancedFarkleProbability, createPreset } from '@farkle/bots';
import { keepQuestion, pressQuestion } from '@farkle/jev';

import { fakeView } from './helpers/fake-view.js';

const six = (die: DieSpec): DieSpec[] => new Array<DieSpec>(6).fill(die);

/**
 * Every face a die in the roster can show, wildcards included — the alphabet
 * a throw is drawn from.
 */
const FACES: readonly Face[] = [1, 2, 3, 4, 5, 6, WILD, WILD_KING, WILD_QUEEN];

/** Every multiset of `n` faces. Order within a throw never changes the keeps. */
function* throws(n: number): Generator<Face[]> {
  if (n === 0) {
    yield [];
    return;
  }
  for (let index = 0; index < FACES.length; index++) {
    for (const rest of throws(n - 1)) {
      const first = FACES[index]!;
      if (rest.length > 0 && FACES.indexOf(rest[0]!) < index) {
        continue;
      }
      yield [first, ...rest];
    }
  }
}

/**
 * A loadout able to produce any of `FACES`, so the leftover-dice identities
 * `KeepOption.diceLeftSpecs` carries are real ones — two of each crown plus
 * ordinary dice, which is also the only way the Crown Bonus can appear.
 */
const MIXED: DieSpec[] = [DEVIL_DIE, DEVIL_DIE, KING_DIE, QUEEN_DIE, BALANCED_DIE, BALANCED_DIE];

describe('keepQuestion', () => {
  /*
   * The load-bearing property of the whole package. A Choice answer is one of
   * the keys that was sent, so the only way a move can come back unusable is
   * if two different keeps were given the same key and one of them was lost.
   * Checked over every throw the rules can produce rather than over a sample,
   * because a collision in a rare throw is exactly the kind of bug that would
   * surface once, mid-match, months later.
   */
  it('gives every legal keep a distinct name, over every throw in the game', () => {
    let checked = 0;
    let widest = 0;

    for (let count = 1; count <= 6; count++) {
      for (const thrown of throws(count)) {
        const dice = MIXED.slice(0, count);
        const keeps = legalKeeps(thrown, dice);
        if (keeps.length === 0) {
          continue;
        }

        const view = fakeView({ thrown, inPlayDice: dice });
        const { options } = keepQuestion(view, keeps);

        expect(options.size).toBe(keeps.length);
        for (const keep of keeps) {
          expect([...options.values()]).toContain(keep);
        }
        widest = Math.max(widest, keeps.length);
        checked++;
      }
    }

    expect(checked).toBeGreaterThan(1000);
    // The 255-option ceiling a Choice imposes is never approached: this is
    // what lets the bot offer every legal move instead of a shortlist.
    expect(widest).toBeLessThanOrEqual(255);
  });

  it('never offers more options than a Choice accepts', () => {
    // Belt and braces for the assertion above: if a future rule change made
    // keeps explode, the question must still be sendable.
    const thrown: Face[] = [1, 5, 5, 5, 5, WILD];
    const dice = MIXED;
    const { question, options } = keepQuestion(fakeView({ thrown, inPlayDice: dice }), legalKeeps(thrown, dice));
    expect(Object.keys(question.criteria).length).toBeLessThanOrEqual(255);
    expect(Object.keys(question.criteria).length).toBe(options.size);
  });

  it('states the points, what is left and the bust risk for each option', () => {
    const thrown: Face[] = [1, 1, 1, 2, 3, 4];
    const dice = six(BALANCED_DIE);
    const { question, options } = keepQuestion(fakeView({ thrown, inPlayDice: dice }), legalKeeps(thrown, dice));

    const [name, keep] = [...options].find(([, option]) => option.points === 1000)!;
    const criteria = question.criteria[name] as Record<string, string>;

    expect(keep.faces).toEqual([1, 1, 1]);
    expect(criteria['scores']).toBe('1000 points, read as three 1s');
    expect(criteria['leaves']).toBe('three in play: three ordinary dice');
    expect(criteria['bust_risk_if_you_then_throw_again']).toMatch(/^(very )?(low|moderate|high) \(/);
  });

  it('says outright when a keep can be banked for the win', () => {
    const thrown: Face[] = [1, 1, 1, 2, 3, 4];
    const dice = six(BALANCED_DIE);
    const view = fakeView({
      thrown,
      inPlayDice: dice,
      target: 1000,
      players: [
        { id: 0, name: 'Jev', total: 0, loadout: six(BALANCED_DIE) },
        { id: 1, name: 'Henry', total: 0, loadout: six(BALANCED_DIE) },
      ],
    });
    const { question, options } = keepQuestion(view, legalKeeps(thrown, dice));
    const [name] = [...options].find(([, option]) => option.points === 1000)!;

    expect((question.criteria[name] as Record<string, string>)['if_you_bank_straight_after']).toContain(
      'WINS THE MATCH',
    );
  });

  it('calls out the Crown Bonus where it applies', () => {
    // A King's crown, a Queen's crown and a third wildcard read as three of a
    // kind, and the King-plus-Queen doubling is the one scoring rule a player
    // could miss by reading the faces alone.
    const thrown: Face[] = [WILD_KING, WILD_QUEEN, WILD];
    const dice = [KING_DIE, QUEEN_DIE, DEVIL_DIE];
    const keeps = legalKeeps(thrown, dice);
    const { question, options } = keepQuestion(fakeView({ thrown, inPlayDice: dice }), keeps);

    const bonus = [...options].find(([, option]) =>
      option.combos.some((combo) => combo.kind === 'CrownBonus'),
    );
    expect(bonus).toBeDefined();
    expect((question.criteria[bonus![0]] as Record<string, string>)['crown_bonus']).toContain('doubling');
  });

  it('does not tell the model to take the most points', () => {
    // The whole judgment being delegated is when to trade points for dice.
    const thrown: Face[] = [1, 1, 1, 2, 3, 4];
    const dice = six(BALANCED_DIE);
    const { question } = keepQuestion(fakeView({ thrown, inPlayDice: dice }), legalKeeps(thrown, dice));
    const instructions = question.instructions as Record<string, string>;
    expect(instructions['how_to_choose']).toContain('not what is worth the most points');
    expect(instructions['how_to_choose']).toContain('Keeping fewer points to leave more dice in play');
  });

  it('carries worked examples, and they agree with what the engine actually plays', () => {
    /*
     * The examples are the one part of the prompt that can be *wrong* rather
     * than merely unhelpful — an invented one would teach bad play. Each is a
     * real throw on which `smart` declines the top-scoring keep, so this
     * re-derives that from the engine instead of trusting the prose.
     */
    const thrown: Face[] = [1, 2, 2, 3, 5, 5];
    const dice = six(BALANCED_DIE);
    const keeps = legalKeeps(thrown, dice);
    const view = fakeView({ thrown, inPlayDice: dice });

    const smart = createPreset('smart', 1);
    const played = smart.chooseKeep(view, keeps);
    expect(played.faces).toEqual([1]);
    expect(played.points).toBe(100);
    expect(played.diceLeft).toBe(5);
    expect(keeps[0]!.points).toBeGreaterThan(played.points);

    const examples = (keepQuestion(view, keeps).question.instructions as Record<string, string[]>)[
      'worked_examples'
    ]!;
    expect(examples.some((line) => line.includes('1, 2, 2, 3, 5, 5') && line.includes('only the 1 for 100'))).toBe(
      true,
    );
  });

  it('states the farkle odds per dice count exactly as the engine computes them', () => {
    const thrown: Face[] = [1, 1, 1, 2, 3, 4];
    const dice = six(BALANCED_DIE);
    const risk = (keepQuestion(fakeView({ thrown, inPlayDice: dice }), legalKeeps(thrown, dice))
      .question.instructions as Record<string, string>)['how_the_risk_scales']!;

    // Jev cannot do this arithmetic; if the prompt states it, it has to be right.
    for (const count of [1, 2, 3, 4, 5, 6]) {
      const percent = Math.round(balancedFarkleProbability(count) * 100);
      expect(risk).toContain(`${percent}%`);
    }
  });
});

describe('pressQuestion', () => {
  it('puts the stake, the odds and what banking would achieve in the question itself', () => {
    const view = fakeView({
      phase: 'AwaitingBankOrThrow',
      turnScore: 750,
      inPlayDice: [BALANCED_DIE, BALANCED_DIE],
      diceInPlay: 2,
      keptThisTurn: [1, 1, 1, 5],
    });
    const text = (pressQuestion(view).instructions as string[]).join(' ');

    expect(text).toContain('750 points');
    expect(text).toContain('two dice are still in play');
    expect(text).toMatch(/is (very )?(low|moderate|high) \(/);
    expect(text).toContain('throwing again is the better play than banking now');
  });

  it('says when banking wins outright, which overrides every other consideration', () => {
    const view = fakeView({
      phase: 'AwaitingBankOrThrow',
      turnScore: 800,
      target: 1000,
      inPlayDice: [BALANCED_DIE],
      diceInPlay: 1,
      players: [
        { id: 0, name: 'Jev', total: 400, loadout: six(BALANCED_DIE) },
        { id: 1, name: 'Henry', total: 0, loadout: six(BALANCED_DIE) },
      ],
    });
    expect((pressQuestion(view).instructions as string[]).join(' ')).toContain(
      'reaches the target and wins the match outright',
    );
  });

  it('describes hot dice as six dice coming back, not as an empty table', () => {
    const view = fakeView({
      phase: 'AwaitingBankOrThrow',
      turnScore: 1500,
      inPlayDice: six(BALANCED_DIE),
      diceInPlay: 6,
      keptThisTurn: [1, 1, 1, 5, 5, 5],
    });
    expect((pressQuestion(view).instructions as string[]).join(' ')).toContain('all six dice come back');
  });
});
