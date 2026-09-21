import { appendFileSync } from 'node:fs';

import { createPreset, isPresetName, PRESET_NAMES, type AsyncBotPolicy, type PresetName } from '@farkle/bots';
import { JevBot, type JevExchange, type JevStats } from '@farkle/jev';

/** Every `--opponent` the CLI accepts: the tuned presets, plus the model. */
export type OpponentName = PresetName | 'jev';

export const OPPONENT_NAMES: readonly OpponentName[] = [...PRESET_NAMES, 'jev'];

export function isOpponentName(name: string): name is OpponentName {
  return name === 'jev' || isPresetName(name);
}

export const API_KEY_ENV = 'TYPESAFE_API_KEY';
export const TRANSCRIPT_ENV = 'JEV_TRANSCRIPT';

/**
 * Why `jev` cannot be played right now, or null if it can. Checked before the
 * match starts rather than at the first decision: a bot named "Jev" that
 * silently played as `smart` because a key was missing would misrepresent
 * every result it produced, and finding that out twenty turns in is worse
 * than not starting.
 */
export function jevUnavailable(env: NodeJS.ProcessEnv = process.env): string | null {
  return env[API_KEY_ENV] ? null : `${API_KEY_ENV} is not set — get a key at https://console.typesafe.ai/keys`;
}

export interface OpponentOptions {
  readonly seed: number;
  /** Where a mid-match fallback or other aside is reported to the player. */
  readonly onNotice: (text: string) => void;
}

/**
 * The bot behind `--opponent`. Returns an `AsyncBotPolicy` for every name,
 * including the synchronous presets — a `BotPolicy` already satisfies that
 * interface, so the game loop has one shape rather than two.
 */
export function createOpponent(name: OpponentName, options: OpponentOptions): AsyncBotPolicy {
  if (name !== 'jev') {
    return createPreset(name, options.seed);
  }

  const transcript = process.env[TRANSCRIPT_ENV];
  return new JevBot({
    apiKey: process.env[API_KEY_ENV],
    seed: options.seed,
    onFallback: (reason, detail) => options.onNotice(`Jev fell back to smart play (${reason}: ${detail})`),
    onExchange: transcript ? (exchange) => appendExchange(transcript, exchange, options.onNotice) : undefined,
  });
}

/**
 * One JSON object per line, appended as the match runs — so a match that ends
 * in a crash still leaves everything up to the crash on disk. Written
 * synchronously because the alternative is buffering a turn's worth of
 * evidence in the process that might be the thing failing.
 */
let transcriptBroken = false;

function appendExchange(path: string, exchange: JevExchange, onNotice: (text: string) => void): void {
  if (transcriptBroken) {
    return;
  }
  try {
    appendFileSync(path, `${JSON.stringify({ at: new Date().toISOString(), ...exchange })}\n`);
  } catch (error) {
    // A transcript is a debugging aid. Losing it should cost the line that
    // said so, not the match in progress.
    transcriptBroken = true;
    onNotice(`could not write ${TRANSCRIPT_ENV} (${error instanceof Error ? error.message : String(error)})`);
  }
}

/** A one-line report of what the model actually did, for the end of a match. */
export function summarizeJev(stats: JevStats): string {
  const fallbacks = Object.values(stats.fallbacks).reduce((sum, count) => sum + count, 0);
  const confidence = stats.meanConfidence === null ? 'n/a' : stats.meanConfidence.toFixed(3);
  const latency = stats.meanMs === null ? 'n/a' : `${Math.round(stats.meanMs)}ms`;
  return (
    `${stats.model ?? 'jev'} · ${stats.calls} calls · mean confidence ${confidence} · ` +
    `${latency} per call · ${fallbacks} fallback${fallbacks === 1 ? '' : 's'} · ` +
    `${stats.inputTokens} input tokens`
  );
}
