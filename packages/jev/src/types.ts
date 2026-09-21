/**
 * The System One wire format, as documented at https://docs.typesafe.ai/api.
 * Hand-written rather than pulled from `@typesafe-ai/sdk` on purpose: the API
 * is one POST with three question shapes, and every other package in this
 * repository has zero npm dependencies (DESIGN.md §2). What the SDK would buy
 * us — retries, typed errors — is `client.ts`, about a hundred lines.
 *
 * Only the two question types this bot asks are modelled. `score` exists in
 * the API; nothing here has a use for a rubric, so it is left out rather than
 * declared and never built.
 */

/**
 * Anything the API accepts where it says "string | object | array". Jev reads
 * text: a nested object is flattened into its field names and values, which is
 * why descriptive keys matter as much as the values under them.
 */
export type Described = string | readonly Described[] | { readonly [key: string]: Described };

export interface ChoiceQuestion {
  readonly type: 'choice';
  readonly instructions: Described;
  /** Option name → what that option means. At most 255 options. */
  readonly criteria: { readonly [option: string]: Described };
}

export interface NoulQuestion {
  readonly type: 'noul';
  readonly instructions: Described;
  readonly criteria?: {
    readonly true?: Described;
    readonly false?: Described;
  };
}

export type Question = ChoiceQuestion | NoulQuestion;

export interface SystemOneRequest {
  readonly state: Described;
  /** `jev-latest` unless something wants to pin a version. */
  readonly model: string;
  readonly questions: { readonly [id: string]: Question };
}

export interface ChoiceAnswer {
  readonly type: 'choice';
  /** The highest-probability option — always one of the keys that was sent. */
  readonly choice: string;
  readonly probabilities: { readonly [option: string]: number };
  /**
   * 0–1, computed from how concentrated `probabilities` is. Not a probability
   * itself — see https://docs.typesafe.ai/confidence. Read `probabilities`
   * when the shape matters and this when only "how sure" does.
   */
  readonly confidence: number;
}

export interface NoulAnswer {
  readonly type: 'noul';
  /** 0–1. There is no `confidence` on a noul; its own distance from 0.5 is the equivalent. */
  readonly noul: number;
}

export type Answer = ChoiceAnswer | NoulAnswer;

export interface Usage {
  readonly input_tokens: number;
  /** Free, per the pricing page — reported anyway, and summed into `JevStats`. */
  readonly output_tokens: number;
}

export interface SystemOneResponse {
  /** The concrete version that answered, e.g. `jev-1.13.0`, even when `jev-latest` was asked for. */
  readonly model: string;
  readonly answers: { readonly [id: string]: Answer };
  /** Optional only because nothing downstream depends on it — the API always sends it. */
  readonly usage?: Usage;
}
