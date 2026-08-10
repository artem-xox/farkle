import {
  BALANCED_DIE,
  CHEAT_DIE,
  DICE_PER_TURN,
  legalKeeps,
  ODD_DIE,
  type DieSpec,
} from '@farkle/engine';
import { describe, expect, it } from 'vitest';

import { balancedFarkleProbability, farkleProbability } from '../src/odds.js';
import type { BotParams } from '../src/threshold-bot.js';
import { ThresholdBot } from '../src/threshold-bot.js';
import { fakeView } from './helpers/fake-view.js';

function fixedDie(face: 1 | 2 | 3 | 4 | 5 | 6): DieSpec {
  const weights: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  weights[face - 1] = 1;
  return { id: `always-${face}`, name: `Always ${face}`, weights };
}

const params = (overrides: Partial<BotParams> = {}): BotParams => ({
  bankAt: 300,
  minDiceToThrow: 2,
  diceValue: 0,
  hotDiceAlwaysThrow: false,
  desperationMargin: 150,
  catchUpBonus: 0.5,
  mistakeRate: 0,
  ...overrides,
});

describe('chooseKeep', () => {
  // 1 1 1 5 6 6: keeping all three 1s (300, 3 dice left) or just two of them
  // (200, 4 dice left) are both legal — a real fork for the diceValue knob.
  const throwFaces = [1, 1, 1, 5, 6, 6] as const;
  const options = legalKeeps([...throwFaces]);
  const view = fakeView();

  it('picks the highest points + diceValue*diceLeft ranking, not raw points', () => {
    const greedy = new ThresholdBot('greedy', params({ diceValue: 0 }), 1);
    const best = greedy.chooseKeep(view, options);
    // With diceValue 0 the ranking is just points, so this must be the
    // engine's own best-scoring option.
    expect(best.points).toBe(options[0]!.points);

    const hoarder = new ThresholdBot('hoarder', params({ diceValue: 1000 }), 1);
    const chosen = hoarder.chooseKeep(view, options);
    const maxDiceLeft = Math.max(...options.map((option) => option.diceLeft));
    expect(chosen.diceLeft).toBe(maxDiceLeft);
  });

  it('is deterministic when mistakeRate is zero, regardless of seed', () => {
    const a = new ThresholdBot('a', params({ diceValue: 10 }), 1);
    const b = new ThresholdBot('b', params({ diceValue: 10 }), 999);
    expect(a.chooseKeep(view, options)).toEqual(b.chooseKeep(view, options));
  });

  it('throws if given no options', () => {
    const bot = new ThresholdBot('bot', params(), 1);
    expect(() => bot.chooseKeep(view, [])).toThrow(RangeError);
  });

  it('never deviates from the top-ranked option when mistakeRate is 0', () => {
    const bot = new ThresholdBot('never-wrong', params({ mistakeRate: 0 }), 42);
    for (let i = 0; i < 50; i++) {
      expect(bot.chooseKeep(view, options).points).toBe(options[0]!.points);
    }
  });

  it('always deviates from the top-ranked option when mistakeRate is 1', () => {
    const bot = new ThresholdBot('always-wrong', params({ mistakeRate: 1 }), 42);
    let sawDeviation = false;
    for (let i = 0; i < 50; i++) {
      const chosen = bot.chooseKeep(view, options);
      expect(chosen).not.toBe(options[0]);
      if (chosen.points !== options[0]!.points) {
        sawDeviation = true;
      }
    }
    expect(sawDeviation).toBe(true);
  });

  it('approximates the configured mistake rate over many draws', () => {
    const bot = new ThresholdBot('sometimes-wrong', params({ mistakeRate: 0.3 }), 7);
    const trials = 20_000;
    let mistakes = 0;
    for (let i = 0; i < trials; i++) {
      if (bot.chooseKeep(view, options) !== options[0]) {
        mistakes++;
      }
    }
    expect(mistakes / trials).toBeGreaterThan(0.27);
    expect(mistakes / trials).toBeLessThan(0.33);
  });

  it('is a no-op with a single legal option even at mistakeRate 1', () => {
    const bot = new ThresholdBot('cornered', params({ mistakeRate: 1 }), 1);
    const onlyOption = [options[0]!];
    expect(bot.chooseKeep(view, onlyOption)).toBe(onlyOption[0]);
  });
});

describe('decideAfterKeep', () => {
  it('always banks when the turn score alone would win', () => {
    const bot = new ThresholdBot(
      'winner',
      params({ bankAt: 100_000, hotDiceAlwaysThrow: true, minDiceToThrow: 0 }),
      1,
    );
    const view = fakeView({ turnScore: 600, target: 500, diceInPlay: DICE_PER_TURN });
    expect(bot.decideAfterKeep(view)).toBe('Bank');
  });

  it('banks below its threshold once dice in play drop below minDiceToThrow', () => {
    const bot = new ThresholdBot('cautious', params({ bankAt: 100_000, minDiceToThrow: 3 }), 1);
    const view = fakeView({ turnScore: 50, diceInPlay: 2 });
    expect(bot.decideAfterKeep(view)).toBe('Bank');
  });

  it('throws below its threshold when enough dice remain', () => {
    const bot = new ThresholdBot('cautious', params({ bankAt: 300, minDiceToThrow: 2 }), 1);
    const view = fakeView({ turnScore: 100, diceInPlay: 3 });
    expect(bot.decideAfterKeep(view)).toBe('Throw');
  });

  it('banks once the turn score reaches bankAt', () => {
    const bot = new ThresholdBot('disciplined', params({ bankAt: 300, minDiceToThrow: 1 }), 1);
    expect(bot.decideAfterKeep(fakeView({ turnScore: 299, diceInPlay: 4 }))).toBe('Throw');
    expect(bot.decideAfterKeep(fakeView({ turnScore: 300, diceInPlay: 4 }))).toBe('Bank');
  });

  it('always throws on hot dice when hotDiceAlwaysThrow is set, however high the turn score', () => {
    const bot = new ThresholdBot(
      'yolo',
      params({ bankAt: 100, hotDiceAlwaysThrow: true }),
      1,
    );
    const view = fakeView({ turnScore: 5000, diceInPlay: DICE_PER_TURN, target: 100_000 });
    expect(bot.decideAfterKeep(view)).toBe('Throw');
  });

  it('does not force a throw on hot dice when hotDiceAlwaysThrow is unset', () => {
    const bot = new ThresholdBot('disciplined', params({ bankAt: 100, hotDiceAlwaysThrow: false }), 1);
    const view = fakeView({ turnScore: 5000, diceInPlay: DICE_PER_TURN, target: 100_000 });
    expect(bot.decideAfterKeep(view)).toBe('Bank');
  });

  it('raises its effective threshold in proportion to how far behind it is', () => {
    const bot = new ThresholdBot('catch-up', params({ bankAt: 200, catchUpBonus: 2, minDiceToThrow: 1 }), 1);
    const players = [
      { id: 0, name: 'me', total: 0, loadout: [] },
      { id: 1, name: 'them', total: 100, loadout: [] },
    ];
    // Behind by 100: effective threshold is 200 + 2*100 = 400.
    expect(bot.decideAfterKeep(fakeView({ turnScore: 250, diceInPlay: 3, players }))).toBe('Throw');
    expect(bot.decideAfterKeep(fakeView({ turnScore: 400, diceInPlay: 3, players }))).toBe('Bank');
  });

  it('ignores a deficit against a player who is not the leader', () => {
    const bot = new ThresholdBot('leader-aware', params({ bankAt: 200, catchUpBonus: 5, minDiceToThrow: 1 }), 1);
    const players = [
      { id: 0, name: 'me', total: 500, loadout: [] },
      { id: 1, name: 'trailing', total: 100, loadout: [] },
    ];
    // I'm ahead of everyone, so the deficit is 0 regardless of catchUpBonus.
    expect(bot.decideAfterKeep(fakeView({ turnScore: 200, diceInPlay: 3, players }))).toBe('Bank');
  });

  it('keeps pushing for the win once an opponent is within desperationMargin of the target', () => {
    const bot = new ThresholdBot(
      'desperate',
      params({ bankAt: 100, desperationMargin: 200, minDiceToThrow: 1 }),
      1,
    );
    const players = [
      { id: 0, name: 'me', total: 1000, loadout: [] },
      { id: 1, name: 'about-to-win', total: 1850, loadout: [] },
    ];
    const target = 2000;
    // Opponent is 150 from the target, inside the 200 margin. A normal
    // bankAt=100 threshold would bank here, but only winning outright helps.
    expect(bot.decideAfterKeep(fakeView({ turnScore: 500, diceInPlay: 3, players, target }))).toBe(
      'Throw',
    );
    // 1000 + 1000 = 2000 reaches the target outright.
    expect(bot.decideAfterKeep(fakeView({ turnScore: 1000, diceInPlay: 3, players, target }))).toBe(
      'Bank',
    );
  });

  it('leaves the threshold alone when no opponent is near the target', () => {
    // catchUpBonus 0 isolates this from the deficit-based threshold increase
    // covered by the "raises its effective threshold" case above.
    const bot = new ThresholdBot(
      'unhurried',
      params({ bankAt: 300, desperationMargin: 50, catchUpBonus: 0 }),
      1,
    );
    const players = [
      { id: 0, name: 'me', total: 0, loadout: [] },
      { id: 1, name: 'them', total: 500, loadout: [] },
    ];
    const view = fakeView({ turnScore: 300, diceInPlay: 3, players, target: 2000 });
    expect(bot.decideAfterKeep(view)).toBe('Bank');
  });

  describe('risk-aware dice-count floor', () => {
    it('falls back to the plain count check when inPlayDice is not given (fakeView default)', () => {
      // Sanity check on the fallback itself: fakeView's default `inPlayDice: []`
      // never matches a positive `diceInPlay`, so every test above this point
      // in the file exercises the pre-M5 count-only behaviour untouched.
      const bot = new ThresholdBot('legacy', params({ bankAt: 100_000, minDiceToThrow: 2 }), 1);
      expect(fakeView({ diceInPlay: 3 }).inPlayDice).toEqual([]);
      expect(bot.decideAfterKeep(fakeView({ turnScore: 50, diceInPlay: 1 }))).toBe('Bank');
      expect(bot.decideAfterKeep(fakeView({ turnScore: 50, diceInPlay: 2 }))).toBe('Throw');
    });

    it('throws below the raw dice-count floor when the dice left are safe enough', () => {
      // A fixture rather than a roster die: no die in the shipped roster is
      // safe enough on its own to beat *two* ordinary dice — that is what
      // the docs/DESIGN.md §5 balance band rules out — but the bot's floor
      // still has to behave correctly if one ever were.
      const veryLoaded: DieSpec = { id: 'very-loaded', name: 'Test die', weights: [10, 1, 1, 1, 1, 1] };
      const inPlayDice = [veryLoaded];
      // Verified directly rather than assumed, since that's the premise the
      // rest of this test depends on.
      expect(farkleProbability(inPlayDice)).toBeLessThan(balancedFarkleProbability(2));

      const bot = new ThresholdBot('risk-aware', params({ bankAt: 100_000, minDiceToThrow: 2 }), 1);
      const view = fakeView({ turnScore: 50, diceInPlay: 1, inPlayDice });
      // The old count-only rule would bank here (1 < minDiceToThrow of 2).
      expect(bot.decideAfterKeep(view)).toBe('Throw');
    });

    it('banks at or above the raw dice-count floor when the dice left are too risky', () => {
      const inPlayDice = [CHEAT_DIE, CHEAT_DIE];
      // Two cheat dice farkle more often than two ordinary ones.
      expect(farkleProbability(inPlayDice)).toBeGreaterThan(balancedFarkleProbability(2));

      const bot = new ThresholdBot('risk-averse', params({ bankAt: 100_000, minDiceToThrow: 2 }), 1);
      const view = fakeView({ turnScore: 50, diceInPlay: 2, inPlayDice });
      // The old count-only rule would throw here (2 is not < minDiceToThrow of 2).
      expect(bot.decideAfterKeep(view)).toBe('Bank');
    });

    it('is identical to the pre-M5 count check on an all-balanced loadout', () => {
      for (const minDiceToThrow of [1, 2, 3]) {
        for (const diceInPlay of [1, 2, 3, 4, 5, 6]) {
          const bot = new ThresholdBot('control', params({ bankAt: 100_000, minDiceToThrow }), 1);
          const inPlayDice = new Array(diceInPlay).fill(BALANCED_DIE) as DieSpec[];
          const withDice = bot.decideAfterKeep(fakeView({ turnScore: 50, diceInPlay, inPlayDice }));
          const withoutDice = bot.decideAfterKeep(fakeView({ turnScore: 50, diceInPlay }));
          expect(withDice, `minDiceToThrow=${minDiceToThrow} diceInPlay=${diceInPlay}`).toBe(
            withoutDice,
          );
        }
      }
    });
  });
});

describe('rankOf risk-awareness (via chooseKeep)', () => {
  // Two dice both show a 5 this throw, but they are not the same die: one is
  // an ordinary die, the other an odd die (favours 1, 3, 5) that simply
  // rolled its 5. Keeping either one scores the same 50 points and leaves
  // the same number of dice (5) — the only difference is which die is left
  // behind, and that difference is exactly what `safetyRatio` should weigh.
  // (A Devil's Head can't play this role: it can never be strictly safer
  // than a balanced die to leave behind — see odds.test.ts.)
  const rest = [fixedDie(2), fixedDie(3), fixedDie(4), fixedDie(6)];
  const dice: DieSpec[] = [BALANCED_DIE, ODD_DIE, ...rest];
  const thrown = [5, 5, 2, 3, 4, 6] as const;

  it('a set that leaves the odd die behind really is safer, as the test below assumes', () => {
    expect(farkleProbability([ODD_DIE, ...rest])).toBeLessThan(
      farkleProbability([BALANCED_DIE, ...rest]),
    );
  });

  it('a dice-hoarding bot prefers to leave the safer die (the odd one) in play', () => {
    const options = legalKeeps([...thrown], dice).filter(
      (option) => option.points === 50 && option.faces.length === 1,
    );
    expect(options).toHaveLength(2);

    const hoarder = new ThresholdBot('hoarder', params({ diceValue: 50, mistakeRate: 0 }), 1);
    const chosen = hoarder.chooseKeep(fakeView(), options);
    const leftoverIds = chosen.diceLeftSpecs!.map((die) => die.id);
    expect(leftoverIds).toContain(ODD_DIE.id);
    expect(leftoverIds).not.toContain(BALANCED_DIE.id);
  });

  it('a purely greedy bot (diceValue 0) is indifferent between them, as before M5', () => {
    const options = legalKeeps([...thrown], dice).filter(
      (option) => option.points === 50 && option.faces.length === 1,
    );
    const greedy = new ThresholdBot('greedy', params({ diceValue: 0, mistakeRate: 0 }), 1);
    // Tied rank falls back to the pre-existing face-string tie-break, not to
    // die identity — diceValue 0 means safetyRatio never enters the ranking.
    const chosen = greedy.chooseKeep(fakeView(), options);
    expect(chosen.points).toBe(50);
  });
});
