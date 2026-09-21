import { describe, expect, it } from 'vitest';

import { BALANCED_DIE, legalKeeps, type DieSpec, type Face, type GameEvent } from '@farkle/engine';
import {
  JevAuthError,
  JevBot,
  JevClient,
  type FetchLike,
  type SystemOneRequest,
} from '@farkle/jev';

import { fakeView } from './helpers/fake-view.js';

const six = (die: DieSpec): DieSpec[] => new Array<DieSpec>(6).fill(die);

interface Sent {
  readonly request: SystemOneRequest;
}

/**
 * A client backed by a function from request to answers, so a test can say
 * "the model picks the option whose name contains X" without a fixture full
 * of option keys it would have to keep in step with `questions.ts`.
 */
function botWith(
  answer: (request: SystemOneRequest) => unknown,
  options: Record<string, unknown> = {},
): { bot: JevBot; sent: Sent[] } {
  const sent: Sent[] = [];
  const fetch: FetchLike = async (_url, init) => {
    const request = JSON.parse(String(init.body)) as SystemOneRequest;
    sent.push({ request });
    const answers = answer(request);
    if (answers instanceof Error) {
      return new Response('{}', { status: 422 });
    }
    return new Response(
      JSON.stringify({ model: 'jev-1.13.0', answers, usage: { input_tokens: 1200, output_tokens: 8 } }),
      { status: 200 },
    );
  };
  const bot = new JevBot({
    client: new JevClient({ apiKey: 'sk-test', fetch, retries: 0, sleep: async () => undefined }),
    seed: 7,
    ...options,
  });
  return { bot, sent };
}

const THROW: readonly Face[] = [1, 1, 1, 2, 3, 4];
const keepView = () => fakeView({ thrown: THROW, inPlayDice: six(BALANCED_DIE) });
const keeps = () => legalKeeps(THROW, six(BALANCED_DIE));

describe('JevBot.chooseKeep', () => {
  it('plays the option the model chose', async () => {
    const { bot, sent } = botWith((request) => {
      const names = Object.keys((request.questions['keep'] as { criteria: object }).criteria);
      const single = names.find((name) => name.startsWith('keep 1 —'))!;
      return { keep: { type: 'choice', choice: single, probabilities: { [single]: 1 }, confidence: 0.9 } };
    });

    const chosen = await bot.chooseKeep(keepView(), keeps());
    expect(chosen.faces).toEqual([1]);
    expect(chosen.points).toBe(100);
    expect(sent).toHaveLength(1);
    expect(bot.stats.calls).toBe(1);
    expect(bot.stats.meanConfidence).toBeCloseTo(0.9);
    // Bucket 9 is [0.9, 1.0] — a mean cannot calibrate a threshold, the
    // distribution can.
    expect(bot.stats.confidenceHistogram[9]).toBe(1);
    expect(bot.stats.confidenceHistogram.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('bins a confidence of exactly 1 into the top bucket rather than an eleventh', async () => {
    const { bot } = botWith((request) => {
      const names = Object.keys((request.questions['keep'] as { criteria: object }).criteria);
      return { keep: { type: 'choice', choice: names[0]!, probabilities: {}, confidence: 1 } };
    });
    await bot.chooseKeep(keepView(), keeps());
    expect(bot.stats.confidenceHistogram).toHaveLength(10);
    expect(bot.stats.confidenceHistogram[9]).toBe(1);
  });

  it('sends the rules, the standings and the whole history it has been shown', async () => {
    const { bot, sent } = botWith((request) => {
      const names = Object.keys((request.questions['keep'] as { criteria: object }).criteria);
      return { keep: { type: 'choice', choice: names[0]!, probabilities: {}, confidence: 1 } };
    });

    const events: GameEvent[] = [
      { type: 'TurnStarted', player: 1, turn: 1 },
      { type: 'Thrown', player: 1, faces: [2, 2, 3, 4, 6, 6] },
      { type: 'Farkled', player: 1, lost: 0 },
    ];
    bot.observe(events);
    await bot.chooseKeep(keepView(), keeps());

    const state = sent[0]!.request.state as Record<string, unknown>;
    expect(String(state['rules'])).toContain('FARKLE');
    expect(state['match']).toBeDefined();
    expect(state['history']).toEqual(['Turn 1: Henry threw 2, 2, 3, 4, 6, 6, which scores nothing — FARKLE, losing 0.']);
    expect(sent[0]!.request.model).toBe('jev-latest');
  });

  it('does not spend a request when only one keep is legal', async () => {
    const thrown: readonly Face[] = [1, 2, 3, 4, 6, 6];
    const dice = six(BALANCED_DIE);
    const only = legalKeeps(thrown, dice);
    expect(only).toHaveLength(1);

    const { bot, sent } = botWith(() => {
      throw new Error('should not have been asked');
    });
    await expect(bot.chooseKeep(fakeView({ thrown, inPlayDice: dice }), only)).resolves.toBe(only[0]);
    expect(sent).toHaveLength(0);
    expect(bot.stats.calls).toBe(0);
  });

  it('falls back when confidence is below the threshold, and counts it', async () => {
    const { bot } = botWith(
      (request) => {
        const names = Object.keys((request.questions['keep'] as { criteria: object }).criteria);
        return { keep: { type: 'choice', choice: names[names.length - 1]!, probabilities: {}, confidence: 0.01 } };
      },
      { minConfidence: 0.5 },
    );

    const chosen = await bot.chooseKeep(keepView(), keeps());
    expect(bot.stats.fallbacks['low-confidence']).toBe(1);
    // `smart` takes the three 1s here, which the low-confidence answer did not.
    expect(chosen.points).toBe(1000);
  });

  it('falls back when the request fails, without failing the turn', async () => {
    const reasons: string[] = [];
    const { bot } = botWith(() => new Error('boom'), {
      onFallback: (reason: string) => reasons.push(reason),
    });

    const chosen = await bot.chooseKeep(keepView(), keeps());
    expect(chosen).toBeDefined();
    expect(bot.stats.fallbacks['request-failed']).toBe(1);
    expect(reasons).toEqual(['request-failed']);
  });

  it('refuses to play on when the key is rejected, rather than quietly becoming smart', async () => {
    const fetch: FetchLike = async () => new Response('{}', { status: 401 });
    const bot = new JevBot({
      client: new JevClient({ apiKey: 'sk-wrong', fetch, retries: 0, sleep: async () => undefined }),
    });
    await expect(bot.chooseKeep(keepView(), keeps())).rejects.toThrow(JevAuthError);
  });

  it('uses the fallback outright when nothing configured it', async () => {
    const bot = new JevBot();
    const chosen = await bot.chooseKeep(keepView(), keeps());
    expect(chosen.points).toBe(1000);
    expect(bot.stats.fallbacks['unconfigured']).toBe(1);
    expect(bot.stats.calls).toBe(0);
  });
});

describe('JevBot.decideAfterKeep', () => {
  const pressView = (turnScore: number, dice: DieSpec[]) =>
    fakeView({
      phase: 'AwaitingBankOrThrow',
      turnScore,
      inPlayDice: dice,
      diceInPlay: dice.length,
      keptThisTurn: [1, 1, 1],
    });

  it('throws on a noul above a half and banks below it', async () => {
    const high = botWith(() => ({ press: { type: 'noul', noul: 0.92 } }));
    await expect(high.bot.decideAfterKeep(pressView(300, [BALANCED_DIE, BALANCED_DIE, BALANCED_DIE]))).resolves.toBe(
      'Throw',
    );

    const low = botWith(() => ({ press: { type: 'noul', noul: 0.08 } }));
    await expect(low.bot.decideAfterKeep(pressView(1200, [BALANCED_DIE]))).resolves.toBe('Bank');
  });

  it('treats a noul sitting on the fence as no answer at all', async () => {
    const { bot } = botWith(() => ({ press: { type: 'noul', noul: 0.5 } }), { pressDeadband: 0.05 });
    await bot.decideAfterKeep(pressView(300, [BALANCED_DIE, BALANCED_DIE, BALANCED_DIE]));
    expect(bot.stats.fallbacks['undecided']).toBe(1);
  });

  it('accumulates usage and latency across a turn, so a match can be costed', async () => {
    const { bot } = botWith(() => ({ press: { type: 'noul', noul: 0.9 } }));
    await bot.decideAfterKeep(pressView(300, [BALANCED_DIE, BALANCED_DIE]));
    await bot.decideAfterKeep(pressView(400, [BALANCED_DIE, BALANCED_DIE]));

    expect(bot.stats.calls).toBe(2);
    expect(bot.stats.inputTokens).toBe(2400);
    expect(bot.stats.model).toBe('jev-1.13.0');
    expect(bot.stats.meanMs).not.toBeNull();
  });
});
