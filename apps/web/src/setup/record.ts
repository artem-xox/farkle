import type { PresetName } from '@farkle/bots';

import type { MatchRecord } from '../storage';

export interface HeadToHead {
  readonly wins: number;
  readonly losses: number;
}

export interface RecordSummary {
  /** Wins and losses against bots only. Pass & play matches are excluded: two humans sharing a device produce a result, but not one that says anything about the player. */
  readonly bots: HeadToHead;
  /** The same, narrowed to the personality currently selected — null when that opponent has never been played. */
  readonly versus: HeadToHead | null;
  /** Best single banked turn across every match, pass & play included: it is a personal best, not a competitive result. */
  readonly bestTurn: number;
}

/**
 * How many bot matches before the record appears at all.
 *
 * Not a rounding convenience — a first screen greeting a new player with
 * "0–1 against bots" is worse than saying nothing, and the line exists to be a
 * reason to come back rather than a reason not to.
 */
export const MIN_MATCHES_TO_SHOW = 3;

const tally = (matches: readonly MatchRecord[]): HeadToHead => ({
  wins: matches.filter((match) => match.youWon).length,
  losses: matches.filter((match) => !match.youWon).length,
});

/**
 * Reduces the stored history to what the setup screen shows, or null when
 * there is not enough of it yet.
 *
 * `preset` is the personality currently selected, so the head-to-head line
 * follows the dropdown — which is most of the point. "Aggressive" is a word;
 * "2–3 vs Aggressive" is an opponent.
 */
export function summarizeHistory(
  history: readonly MatchRecord[],
  preset: PresetName | null,
): RecordSummary | null {
  const botMatches = history.filter((match) => match.opponent !== null);
  if (botMatches.length < MIN_MATCHES_TO_SHOW) {
    return null;
  }

  const versusMatches =
    preset === null ? [] : botMatches.filter((match) => match.opponent === preset);

  return {
    bots: tally(botMatches),
    versus: versusMatches.length === 0 ? null : tally(versusMatches),
    bestTurn: history.reduce((best, match) => Math.max(best, match.yourBestTurn), 0),
  };
}
