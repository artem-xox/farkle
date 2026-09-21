import {
  DICE_PER_TURN,
  isWild,
  WILD_KING,
  WILD_QUEEN,
  type ClientView,
  type Combo,
  type DieSpec,
  type Face,
  type GameEvent,
  type PlayerId,
} from '@farkle/engine';
import { farkleProbability } from '@farkle/bots';

import { RULES_DIGEST } from './rules.js';
import type { Described } from './types.js';

/*
 * Everything in this file is a pure function from what the engine already
 * knows to English. It exists because of one line on
 * https://docs.typesafe.ai/model-jaggedness/jev-1.13.md: Jev "does not count
 * reliably", is poor at arithmetic, and "performs better with named buckets
 * or English representations than raw numeric data".
 *
 * So the division of labour is: the engine computes, Jev judges. Points,
 * dice counts, farkle probabilities, distances to the target — all of it is
 * worked out here, by code that is already tested, and handed over as a fact
 * in a sentence. Nowhere is Jev asked to add, count or compare numbers in
 * order to make its move. Where a number survives into the state it is
 * paired with the English bucket it falls in, so the judgment can be made
 * from the word even if the digits mean nothing.
 */

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six'] as const;

/** `1, 'turn'` → `"1 turn"`; `3, 'turn'` → `"3 turns"`. English the model reads should be English. */
const times = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/** `3` → `"three"`. Dice counts never exceed six; anything larger falls back to digits. */
export function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

export function faceLabel(face: Face): string {
  if (face === WILD_KING) {
    return "King's crown";
  }
  if (face === WILD_QUEEN) {
    return "Queen's crown";
  }
  if (isWild(face)) {
    return "Devil's Head";
  }
  return String(face);
}

/** `[1, 5, WILD]` → `"1, 5, Devil's Head"`. Empty reads as `"nothing"` rather than as an empty string. */
export function describeFaces(faces: readonly Face[]): string {
  return faces.length === 0 ? 'nothing' : faces.map(faceLabel).join(', ');
}

const dieLabel = (die: DieSpec): string => die.name.replace(/ die$/i, '');

/**
 * `[balanced ×6]` → `"six ordinary dice"`. Grouped by die rather than listed,
 * because the identity of each die is what matters and its position is not
 * anything a player decides with.
 */
export function describeDice(dice: readonly DieSpec[]): string {
  if (dice.length === 0) {
    return 'no dice';
  }
  const counts = new Map<string, number>();
  for (const die of dice) {
    const label = dieLabel(die);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const parts = [...counts].map(
    ([label, count]) => `${countWord(count)} ${label.toLowerCase()}${count === 1 ? ' die' : ' dice'}`,
  );
  return parts.join(' and ');
}

/**
 * A farkle probability as a name plus the odds in words. The bands are cut
 * where the decision actually changes rather than at round decimals: below
 * about one in ten throwing again is close to free, and above about six in
 * ten the throw is more likely to lose the turn than to add to it — which is
 * roughly where a single die sits (two-thirds), the situation this bot has to
 * get right most often.
 */
export function riskBucket(probability: number): string {
  /*
   * "1 in N" reads naturally for a long shot and badly for a likely one:
   * rounding 1/0.67 gives "1 in 1", which reads as certainty for what is
   * really two throws in three. So the odds flip form at even money —
   * "1 in N" below it, "N in 10" above.
   */
  const odds =
    probability <= 0
      ? 'never'
      : probability <= 0.5
        ? `about 1 in ${Math.round(1 / probability)}`
        : `about ${Math.round(probability * 10)} in 10`;
  if (probability < 0.1) {
    return `very low (${odds})`;
  }
  if (probability < 0.25) {
    return `low (${odds})`;
  }
  if (probability < 0.45) {
    return `moderate (${odds})`;
  }
  if (probability < 0.6) {
    return `high (${odds})`;
  }
  return `very high (${odds})`;
}

/** The chance that throwing `dice` scores nothing at all, bucketed. */
export function bustRisk(dice: readonly DieSpec[]): string {
  if (dice.length === 0) {
    // Nothing left in play means hot dice: six fresh dice, not a certain bust.
    return 'not applicable — keeping these dice clears the table (hot dice)';
  }
  return riskBucket(farkleProbability(dice));
}

/** `"a straight 1-2-3-4-5 and a single 5"` — how the engine read the keep, in words. */
export function describeCombos(combos: readonly Combo[]): string {
  const parts = combos.map((combo) => {
    switch (combo.kind) {
      case 'Single':
        return `a single ${combo.faces[0]}`;
      case 'OfAKind':
        return `${countWord(combo.faces.length)} ${combo.faces[0]}s`;
      case 'StraightLow':
        return 'a straight 1-2-3-4-5';
      case 'StraightHigh':
        return 'a straight 2-3-4-5-6';
      case 'StraightFull':
        return 'a full straight 1-2-3-4-5-6';
      case 'CrownBonus':
        return 'the Crown Bonus, doubling the keep';
    }
  });
  return parts.length === 0 ? 'nothing' : parts.join(' and ');
}

/**
 * The match log, one English line per thing that happened, in order. This is
 * the only history there is: `ClientView` is a snapshot, so `JevBot` keeps
 * this list as `observe` feeds it events.
 *
 * `Thrown` is deliberately dropped. Every throw is followed by the keep or
 * the farkle it produced, both of which name the dice involved, so the throw
 * line adds length without adding information — and length is the thing to
 * spend carefully here.
 */
export function describeHistory(
  events: readonly GameEvent[],
  names: readonly string[],
): string[] {
  const who = (id: PlayerId): string => names[id] ?? `Player ${id}`;
  const lines: string[] = [];
  /*
   * Throws within a turn, so a throw that is not the first one can be
   * reported as what it actually is: a decision to press on rather than
   * bank. The engine emits no event for that choice — it is the *absence* of
   * a `Banked` — so without reconstructing it here the log shows what the
   * opponent scored and never what they were willing to risk to score it.
   * That is the one thing in the history worth adapting to.
   */
  let throwsThisTurn = 0;
  let diceInPlay = DICE_PER_TURN;
  let atRisk = 0;
  /*
   * One, not zero. A match is *created* on turn 1 — `createMatch` builds the
   * state directly and emits no events — so the first `TurnStarted` any
   * observer ever sees announces turn 2. Starting the counter at zero made
   * the opening turn of every match read as "Turn 0".
   */
  let turn = 1;
  let lastThrow: readonly Face[] = [];

  for (const event of events) {
    switch (event.type) {
      case 'TurnStarted':
        turn = event.turn;
        throwsThisTurn = 0;
        diceInPlay = DICE_PER_TURN;
        atRisk = 0;
        break;
      case 'Thrown':
        lastThrow = event.faces;
        throwsThisTurn++;
        if (throwsThisTurn > 1) {
          lines.push(
            `Turn ${turn}: ${who(event.player)} chose to throw again rather than bank, ` +
              `putting ${atRisk} at risk on ${countWord(diceInPlay)} ${diceInPlay === 1 ? 'die' : 'dice'}.`,
          );
        }
        break;
      case 'Kept':
        diceInPlay -= event.faces.length;
        atRisk = event.turnScore;
        lines.push(
          `Turn ${turn}: ${who(event.player)} threw ${describeFaces(lastThrow)} and kept ` +
            `${describeFaces(event.faces)} for ${event.points} ` +
            `(${describeCombos(event.combos)}), turn score ${event.turnScore}.`,
        );
        break;
      case 'HotDice':
        diceInPlay = DICE_PER_TURN;
        lines.push(`Turn ${turn}: ${who(event.player)} cleared the table — hot dice, all six back.`);
        break;
      case 'Farkled':
        lines.push(
          `Turn ${turn}: ${who(event.player)} threw ${describeFaces(lastThrow)}, which scores ` +
            `nothing — FARKLE, losing ${event.lost}.`,
        );
        break;
      case 'Banked':
        lines.push(
          `Turn ${turn}: ${who(event.player)} banked ${event.points}, total now ${event.total}.`,
        );
        break;
      case 'MatchWon':
        lines.push(`${who(event.winner)} reached the target with ${event.total} and won.`);
        break;
      case 'TurnEnded':
        break;
    }
  }

  return lines;
}

/**
 * How each player has actually been playing, in one sentence each — banks,
 * farkles, best turn, and how often they pressed on rather than banked.
 *
 * Every number here is already in `history`, which is exactly why this
 * exists: Jev is documented as unable to count "items in a long list"
 * (https://docs.typesafe.ai/model-jaggedness/jev-1.13.md), so a tally it
 * would have to derive by counting twenty lines is a tally it will get
 * wrong. Counting is cheap here and unreliable there.
 */
export function summariseTurns(
  events: readonly GameEvent[],
  names: readonly string[],
): Record<string, string> {
  const banks: number[] = names.map(() => 0);
  const banked: number[] = names.map(() => 0);
  const best: number[] = names.map(() => 0);
  const farkles: number[] = names.map(() => 0);
  const presses: number[] = names.map(() => 0);
  let throwsThisTurn = 0;

  for (const event of events) {
    switch (event.type) {
      case 'TurnStarted':
        throwsThisTurn = 0;
        break;
      case 'Thrown':
        throwsThisTurn++;
        if (throwsThisTurn > 1) {
          presses[event.player] = (presses[event.player] ?? 0) + 1;
        }
        break;
      case 'Banked':
        banks[event.player] = (banks[event.player] ?? 0) + 1;
        banked[event.player] = (banked[event.player] ?? 0) + event.points;
        best[event.player] = Math.max(best[event.player] ?? 0, event.points);
        break;
      case 'Farkled':
        farkles[event.player] = (farkles[event.player] ?? 0) + 1;
        break;
      default:
        break;
    }
  }

  const summary: Record<string, string> = {};
  names.forEach((name, id) => {
    const turnsPlayed = (banks[id] ?? 0) + (farkles[id] ?? 0);
    if (turnsPlayed === 0) {
      summary[name] = 'has not finished a turn yet';
      return;
    }
    const bankCount = banks[id] ?? 0;
    const farkleCount = farkles[id] ?? 0;
    const pressCount = presses[id] ?? 0;
    const average = bankCount === 0 ? 0 : Math.round((banked[id] ?? 0) / bankCount);
    const banking =
      bankCount === 0
        ? 'banked none of them'
        : `banked ${bankCount} of them (best ${best[id]}, average ${average})`;
    summary[name] =
      `${times(turnsPlayed, 'turn')} finished: ${banking}, ` +
      `${farkleCount === 0 ? 'never farkled' : `farkled ${times(farkleCount, 'time')}`}. ` +
      `${
        pressCount === 0
          ? 'Has not once chosen to throw again rather than bank.'
          : `Chose to throw again rather than bank ${times(pressCount, 'time')}.`
      }`;
  });
  return summary;
}

export interface StateOptions {
  /**
   * Cap on the serialized state, in characters. Roughly four characters to
   * the token, so the 24 000 default is about 6k tokens against a 32k limit —
   * far below the ceiling on purpose. The binding constraint is not the
   * ceiling but context rot: the same jaggedness page warns that "unrelated
   * detail acts as a distractor". When the history would push past this, its
   * oldest turns are dropped and replaced with one line saying how many.
   */
  readonly maxChars?: number;
}

const DEFAULT_MAX_CHARS = 24_000;

/**
 * Everything a player at this table can see, as one object. Deliberately an
 * object and not a prose blob — https://docs.typesafe.ai/concepts/state
 * recommends objects "to keep relationships clear with descriptive field
 * names", and the field names here are doing real work: `at_risk` and
 * `points_you_still_need` are the two quantities the whole game turns on.
 *
 * `history` is the full match by default, per what this bot was asked for: it
 * plays knowing how the game has gone, not just how it stands.
 */
export function buildState(
  view: ClientView,
  history: readonly string[],
  events: readonly GameEvent[] = [],
  options: StateOptions = {},
): Described {
  const you = view.players[view.you]!;
  const others = view.players.filter((player) => player.id !== view.you);
  const leader = [...view.players].sort((a, b) => b.total - a.total)[0]!;

  const opponents = others.map((player) => ({
    name: player.name,
    banked: String(player.total),
    still_needs: `${view.target - player.total} to win`,
    dice: describeDice(player.loadout),
  }));

  const base = {
    game: 'Farkle, the dice game as played in Kingdom Come: Deliverance II',
    rules: RULES_DIGEST,
    match: {
      target: `first to bank ${view.target} points wins`,
      turn_number: String(view.turn),
      you: {
        name: you.name,
        banked: String(you.total),
        still_needs: `${Math.max(0, view.target - you.total)} to win`,
        dice: describeDice(you.loadout),
      },
      opponents,
      standing:
        leader.total === you.total
          ? 'level'
          : leader.id === view.you
            ? `you lead by ${you.total - Math.max(...others.map((p) => p.total))}`
            : `you trail ${leader.name} by ${leader.total - you.total}`,
    },
    how_each_player_has_been_playing: summariseTurns(
      events,
      view.players.map((player) => player.name),
    ),
    this_turn: {
      turn_score_so_far: `${view.turnScore} points, all of it lost if you farkle`,
      kept_so_far: describeFaces(view.keptThisTurn),
      dice_still_in_play: describeDice(view.inPlayDice),
      the_throw_in_front_of_you:
        view.thrown.length === 0
          ? 'nothing thrown right now — the dice you kept are already set aside'
          : describeFaces(view.thrown),
    },
  };

  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const fixed = JSON.stringify({ ...base, history: [] }).length;
  const kept = trimHistory(history, Math.max(0, maxChars - fixed));

  return { ...base, history: kept };
}

/**
 * Keeps the most recent lines that fit, oldest dropped first, and says so
 * where they were. Saying so matters: silently truncated history would make
 * "the opponent has farkled three times running" wrong rather than merely
 * absent.
 */
function trimHistory(history: readonly string[], budget: number): readonly string[] {
  const total = history.reduce((sum, line) => sum + line.length + 4, 0);
  if (total <= budget) {
    return history;
  }

  const kept: string[] = [];
  let used = 60; // room for the elision line this will need
  for (let index = history.length - 1; index >= 0; index--) {
    const line = history[index]!;
    if (used + line.length + 4 > budget) {
      kept.unshift(`(${index + 1} earlier entries omitted to keep this brief)`);
      break;
    }
    used += line.length + 4;
    kept.unshift(line);
  }
  return kept;
}
