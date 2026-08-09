import { DICE_PER_TURN, legalKeeps } from '@farkle/engine';
import { describe, expect, it } from 'vitest';

import type { BotParams } from '../src/threshold-bot.js';
import { ThresholdBot } from '../src/threshold-bot.js';
import { fakeView } from './helpers/fake-view.js';

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
});
