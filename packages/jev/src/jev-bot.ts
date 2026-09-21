import { createPreset, type AsyncBotPolicy, type BotPolicy } from '@farkle/bots';
import type { ClientView, GameEvent, KeepOption } from '@farkle/engine';

import { DEFAULT_MODEL, JevAuthError, JevClient, type JevClientOptions } from './client.js';
import { buildState, describeHistory } from './describe.js';
import { keepQuestion, pressQuestion } from './questions.js';
import type { ChoiceAnswer, NoulAnswer, SystemOneRequest } from './types.js';

/** Why a decision came from the fallback policy rather than from the model. */
export type FallbackReason = 'unconfigured' | 'request-failed' | 'low-confidence' | 'undecided';

export interface JevStats {
  /** Requests actually sent. A decision with only one legal answer sends none. */
  readonly calls: number;
  readonly fallbacks: Readonly<Record<FallbackReason, number>>;
  /** Mean `confidence` over every keep Choice answered, or null if none were. */
  readonly meanConfidence: number | null;
  /** How many Choices that mean is over — what a caller needs to pool means across bots. */
  readonly choices: number;
  /**
   * Those Choices counted into ten buckets of 0.1, `[0, 0.1)` first. A mean
   * cannot calibrate `minConfidence` — it says nothing about how many answers
   * sit near the threshold, or whether the low-confidence ones are the wrong
   * ones — and a threshold picked without that is a guess. This is what a
   * benchmark run needs to replace the guess with a number.
   */
  readonly confidenceHistogram: readonly number[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Mean wall-clock per request in milliseconds, retries included. */
  readonly meanMs: number | null;
  /** The concrete model version the API last answered with, e.g. `jev-1.13.0`. */
  readonly model: string | null;
}

export interface JevOptions extends JevClientOptions {
  /** A ready-made client, if the caller wants to share one across seats. */
  readonly client?: JevClient;
  /**
   * What decides when the model cannot. Defaults to the `smart` preset — the
   * strongest thing in `@farkle/bots`, so a fallback is a downgrade in
   * character rather than in competence.
   */
  readonly fallback?: BotPolicy;
  /** Seeds the default fallback, so its (rare) randomness stays reproducible. */
  readonly seed?: number;
  /**
   * Below this `confidence`, the keep Choice is handed to the fallback.
   *
   * The documented tiers (act above 0.9, escalate below 0.5 —
   * https://docs.typesafe.ai/confidence) are written for a handful of
   * options. A keep Choice routinely offers dozens, across which probability
   * mass is necessarily thin, so a 0.5 threshold here would quietly turn this
   * bot into its own fallback and the benchmark would measure `smart` twice.
   * The default is therefore low and the number is meant to be calibrated
   * against a measured confidence distribution, not assumed —
   * docs/researches/2026-09-21-jev-as-a-policy.md.
   */
  readonly minConfidence?: number;
  /**
   * A Noul this close to 0.5 is not an answer, it is a shrug — press-or-bank
   * goes to the fallback instead. Small by default: unlike the keep Choice,
   * this question has two outcomes, so even a weak lean carries information.
   */
  readonly pressDeadband?: number;
  /** Called whenever a decision falls back, so a client can say so out loud. */
  readonly onFallback?: (reason: FallbackReason, detail: string) => void;
}

const ZERO_FALLBACKS: Record<FallbackReason, number> = {
  unconfigured: 0,
  'request-failed': 0,
  'low-confidence': 0,
  undecided: 0,
};

/**
 * A policy whose moves come from Jev, TypeSafe's System One model
 * (https://docs.typesafe.ai). Every decision sends the whole game — the
 * rules, the match so far, the dice on the table and every legal move, all in
 * English with the arithmetic already done — and takes back a typed answer
 * that is a legal move by construction.
 *
 * Two things it is careful about:
 *
 * **It never pretends.** A request that fails, an answer too uncertain to be
 * one, or no API key at all, and the decision goes to `fallback` — but the
 * reason is counted in `stats` and pushed to `onFallback`, and the clients
 * say so where the player can see it. A bot presented as "Jev" that is
 * quietly `smart` would be a lie about the thing this package exists to
 * measure.
 *
 * **It is not deterministic.** Every other policy in this repository is a
 * pure function of the view and a seed, which is what makes `--seed` replay a
 * match exactly. This one is not, and no seed will make it so. See
 * DESIGN.md §6.
 */
export class JevBot implements AsyncBotPolicy {
  readonly name = 'Jev';

  private readonly client: JevClient;
  private readonly fallback: BotPolicy;
  private readonly minConfidence: number;
  private readonly pressDeadband: number;
  private readonly onFallback: ((reason: FallbackReason, detail: string) => void) | undefined;
  private readonly configured: boolean;

  private readonly events: GameEvent[] = [];
  private calls = 0;
  private readonly fallbacks: Record<FallbackReason, number> = { ...ZERO_FALLBACKS };
  private confidenceSum = 0;
  private confidenceCount = 0;
  private readonly confidenceBuckets: number[] = new Array<number>(10).fill(0);
  private inputTokens = 0;
  private outputTokens = 0;
  private totalMs = 0;
  private model: string | null = null;

  constructor(options: JevOptions = {}) {
    this.client = options.client ?? new JevClient(options);
    this.fallback = options.fallback ?? createPreset('smart', options.seed ?? 0);
    this.minConfidence = options.minConfidence ?? 0.15;
    this.pressDeadband = options.pressDeadband ?? 0.02;
    this.onFallback = options.onFallback;
    /*
     * A client pointed at a proxy carries no key of its own — the browser
     * build works exactly that way — so "no key" is only a misconfiguration
     * when nothing else was supplied either.
     */
    this.configured =
      options.client !== undefined ||
      options.apiKey !== undefined ||
      options.baseUrl !== undefined ||
      options.fetch !== undefined;
  }

  observe(events: readonly GameEvent[]): void {
    this.events.push(...events);
  }

  get stats(): JevStats {
    return {
      calls: this.calls,
      fallbacks: { ...this.fallbacks },
      meanConfidence:
        this.confidenceCount === 0 ? null : this.confidenceSum / this.confidenceCount,
      choices: this.confidenceCount,
      confidenceHistogram: [...this.confidenceBuckets],
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      meanMs: this.calls === 0 ? null : this.totalMs / this.calls,
      model: this.model,
    };
  }

  async chooseKeep(view: ClientView, options: readonly KeepOption[]): Promise<KeepOption> {
    // One legal keep is not a decision. Asking anyway would spend a request
    // and a round trip to be told the only thing it could say.
    if (options.length === 1) {
      return options[0]!;
    }
    if (!this.configured) {
      return this.fellBack('unconfigured', 'no TypeSafe client configured', () =>
        this.fallback.chooseKeep(view, options),
      );
    }

    const { question, options: byName } = keepQuestion(view, options);
    const answer = await this.ask(view, { keep: question });
    if (answer === null) {
      return this.fallback.chooseKeep(view, options);
    }

    const keep = answer['keep'];
    if (keep === undefined || keep.type !== 'choice') {
      return this.fellBack('request-failed', 'no keep answer came back', () =>
        this.fallback.chooseKeep(view, options),
      );
    }
    this.recordConfidence(keep);

    const chosen = byName.get(keep.choice);
    if (chosen === undefined) {
      // Type-safe output means this should be unreachable: the API can only
      // return a key that was sent. Kept as a real branch anyway, because
      // "cannot happen" is not the same as "need not be handled".
      return this.fellBack(
        'request-failed',
        `answer "${keep.choice}" is not one of the options offered`,
        () => this.fallback.chooseKeep(view, options),
      );
    }
    if (keep.confidence < this.minConfidence) {
      return this.fellBack(
        'low-confidence',
        `keep confidence ${keep.confidence.toFixed(3)} below ${this.minConfidence}`,
        () => this.fallback.chooseKeep(view, options),
      );
    }
    return chosen;
  }

  async decideAfterKeep(view: ClientView): Promise<'Throw' | 'Bank'> {
    if (!this.configured) {
      return this.fellBack('unconfigured', 'no TypeSafe client configured', () =>
        this.fallback.decideAfterKeep(view),
      );
    }

    const answer = await this.ask(view, { press: pressQuestion(view) });
    if (answer === null) {
      return this.fallback.decideAfterKeep(view);
    }

    const press = answer['press'];
    if (press === undefined || press.type !== 'noul') {
      return this.fellBack('request-failed', 'no press answer came back', () =>
        this.fallback.decideAfterKeep(view),
      );
    }
    if (Math.abs(press.noul - 0.5) <= this.pressDeadband) {
      return this.fellBack(
        'undecided',
        `press noul ${press.noul.toFixed(3)} is inside the deadband`,
        () => this.fallback.decideAfterKeep(view),
      );
    }
    return press.noul > 0.5 ? 'Throw' : 'Bank';
  }

  /**
   * One request. Returns null when it failed — the caller falls back — except
   * for an authentication failure, which is a configuration mistake and is
   * rethrown: playing on under the name "Jev" with a key the server rejected
   * would misreport what happened.
   */
  private async ask(
    view: ClientView,
    questions: SystemOneRequest['questions'],
  ): Promise<Record<string, ChoiceAnswer | NoulAnswer> | null> {
    const names = view.players.map((player) => player.name);
    const state = buildState(view, describeHistory(this.events, names), this.events);

    const started = Date.now();
    try {
      const response = await this.client.systemOne({
        state,
        model: DEFAULT_MODEL,
        questions,
      });
      this.calls++;
      this.totalMs += Date.now() - started;
      this.inputTokens += response.usage?.input_tokens ?? 0;
      this.outputTokens += response.usage?.output_tokens ?? 0;
      this.model = response.model;
      return response.answers as Record<string, ChoiceAnswer | NoulAnswer>;
    } catch (error) {
      if (error instanceof JevAuthError) {
        throw error;
      }
      this.calls++;
      this.totalMs += Date.now() - started;
      this.fallbacks['request-failed']++;
      this.onFallback?.(
        'request-failed',
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  private recordConfidence(answer: ChoiceAnswer): void {
    this.confidenceSum += answer.confidence;
    this.confidenceCount++;
    // A confidence of exactly 1 belongs in the last bucket, not an eleventh.
    const bucket = Math.min(9, Math.max(0, Math.floor(answer.confidence * 10)));
    this.confidenceBuckets[bucket]! += 1;
  }

  private fellBack<T>(reason: FallbackReason, detail: string, decide: () => T): T {
    this.fallbacks[reason]++;
    this.onFallback?.(reason, detail);
    return decide();
  }
}
