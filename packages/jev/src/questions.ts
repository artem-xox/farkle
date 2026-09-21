import { DICE_PER_TURN, type ClientView, type KeepOption } from '@farkle/engine';

import { bustRisk, countWord, describeCombos, describeDice, describeFaces } from './describe.js';
import type { ChoiceQuestion, Described, NoulQuestion } from './types.js';

/**
 * A Farkle turn is exactly two decisions, and the engine can already
 * enumerate the legal answers to both — so neither of them needs a model that
 * writes. `chooseKeep` is a Choice over `view.keeps`; `decideAfterKeep` is a
 * Noul. That is the whole reason a System One model fits this problem: the
 * move is the answer to a typed question, and a typed answer cannot be an
 * illegal move.
 */

/*
 * Examples, and why they are these examples.
 *
 * The structured-criteria guidance (https://docs.typesafe.ai/primitives/advanced)
 * allows objects with `examples` on both Choice options and Noul criteria, so
 * this is the shape a worked example takes for a System One model — there is
 * no message history to put a few-shot turn in.
 *
 * Every number below is the engine's, not a guess. The farkle percentages are
 * `balancedFarkleProbability`, and each keep example is a real throw on which
 * the `smart` preset — the strongest policy in `@farkle/bots`, and the one
 * this bot is measured against — declines the highest-scoring option in
 * favour of one that leaves more dice. Inventing plausible-looking examples
 * risked teaching the model wrong play, which is worse than teaching it
 * nothing; these were found by enumerating throws and asking `smart` what it
 * does.
 *
 * The press thresholds are the turn scores at which `smart` flips from
 * throwing to banking on a fresh match at the default target, again measured
 * rather than assumed.
 */
const WORKED_EXAMPLES = {
  risk:
    'On ordinary dice the chance a throw scores nothing is about 3% on six dice, 8% on five, ' +
    '16% on four, 28% on three, 44% on two and 67% on one. So the last die or two is where ' +
    'turns are lost, and a keep that leaves you there needs to be worth it.',
  keeps: [
    'Six dice showed 1, 2, 2, 3, 5, 5. Taking only the 1 for 100 and leaving five dice is ' +
      'better than taking 1, 5, 5 for 200 and leaving three: the extra 100 is not worth moving ' +
      'from an 8% chance of losing the turn to a 28% one.',
    'Six dice showed 1, 1, 2, 2, 3, 5. Taking 1, 1 for 200 and leaving four dice is better ' +
      'than taking 1, 1, 5 for 250 and leaving three — 50 points does not pay for that jump ' +
      'in risk.',
    'A keep that uses every die in play is worth extra beyond its points: it clears the table, ' +
      'all six dice come back, and the turn score carries over. Taking slightly fewer points ' +
      'to clear the table is often the best move on the board.',
    'The reverse also holds. When a keep wins the match outright once banked, take it and ' +
      'bank; no number of extra points is worth any chance of losing a match-winning turn.',
  ],
  press: {
    throw:
      'Throwing again is right while the turn score is small next to what another throw could ' +
      'add, or while plenty of dice are left. On a fresh match at the default target, strong ' +
      'play throws again on five or six dice almost regardless of the turn score, on four dice ' +
      'below roughly 950, on three below roughly 350, and on two below roughly 150.',
    bank:
      'Banking is right once the turn score is large next to what a throw adds, and that point ' +
      'arrives fast as dice leave play: on one die strong play banks almost anything, since ' +
      'two throws in three score nothing. Banking is also right whenever it wins the match.',
    race:
      'The race overrides both. Being far behind justifies throwing past these points, because ' +
      'a safe small bank does not win; being close to the target with the opponent far away ' +
      'justifies banking earlier than they suggest.',
  },
} as const;

/**
 * A Choice accepts up to 255 options (https://docs.typesafe.ai/primitives/choice),
 * and the docs ask for the comprehensive list rather than a shortlist. The
 * worst throw the rules allow — `1 5 5 5 5` plus a wildcard — produces 53
 * legal keeps, verified by exhaustive enumeration over every throw of one to
 * six dice, wildcards included. So the cap is never reached and this constant
 * is a guard against a future rule change, not a working limit; if it ever
 * bites, `view.keeps` is already ordered best-scoring first, so what survives
 * is the top of the list.
 */
const MAX_OPTIONS = 255;

export interface KeepChoice {
  readonly question: ChoiceQuestion;
  /** Option name → the keep it stands for. How an answer becomes a move. */
  readonly options: ReadonlyMap<string, KeepOption>;
}

/**
 * The option's name, which Jev reads as text like everything else — so it
 * says what the option *is* rather than being an opaque index. Uniqueness
 * matters more than brevity: two keeps that take the same faces for the same
 * points can still differ in which dice they leave behind (an ordinary die
 * versus a Devil's Head), and collapsing them would hide a real choice.
 */
function optionName(option: KeepOption, taken: ReadonlySet<string>): string {
  const base =
    `keep ${describeFaces(option.faces)} — ${option.points} points, ` +
    (option.diceLeft === 0 ? 'clears the table' : `${countWord(option.diceLeft)} left in play`);
  if (!taken.has(base)) {
    return base;
  }
  const specs = option.diceLeftSpecs;
  const qualified = specs === undefined ? base : `${base} (${describeDice(specs)} left)`;
  if (!taken.has(qualified)) {
    return qualified;
  }
  for (let suffix = 2; ; suffix++) {
    const numbered = `${qualified} [${suffix}]`;
    if (!taken.has(numbered)) {
      return numbered;
    }
  }
}

/**
 * What one option means, as a small object rather than a sentence — the docs
 * recommend structured criteria "when options are similar", and here they are
 * nearly identical to each other. Every field is a finished fact: the points
 * are totalled, the risk is bucketed, the win condition is already checked.
 */
function optionCriteria(view: ClientView, option: KeepOption): Described {
  const you = view.players[view.you]!;
  const turnTotal = view.turnScore + option.points;
  const bankedTotal = you.total + turnTotal;
  const wins = bankedTotal >= view.target;
  const hot = option.diceLeft === 0;

  const criteria: Record<string, Described> = {
    takes: describeFaces(option.faces),
    scores: `${option.points} points, read as ${describeCombos(option.combos)}`,
    turn_score_if_you_take_it: `${turnTotal} points at risk`,
    leaves: hot
      ? `nothing in play — hot dice, so you get all ${countWord(DICE_PER_TURN)} back if you throw again`
      : `${countWord(option.diceLeft)} in play: ${describeDice(option.diceLeftSpecs ?? [])}`,
    bust_risk_if_you_then_throw_again: hot
      ? bustRisk(you.loadout)
      : bustRisk(option.diceLeftSpecs ?? []),
    if_you_bank_straight_after: wins
      ? `banks ${turnTotal} for a total of ${bankedTotal} — that reaches the target and WINS THE MATCH`
      : `banks ${turnTotal} for a total of ${bankedTotal}, still ${view.target - bankedTotal} short of the target`,
  };

  const wilds = option.combos.reduce((sum, combo) => sum + combo.wilds, 0);
  if (wilds > 0) {
    criteria['wildcards_used'] = `${countWord(wilds)} wildcard${wilds === 1 ? '' : 's'} spent to make this`;
  }
  if (option.combos.some((combo) => combo.kind === 'CrownBonus')) {
    criteria['crown_bonus'] = 'a King and a Queen crown are both in this keep, doubling its value';
  }

  return criteria;
}

/**
 * The keep decision. Note what is *not* asked: nothing here says "pick the
 * highest score". Taking the most points is frequently the wrong move —
 * 1200 leaving one die is worse than 600 leaving three, because a lone die
 * farkles two throws in three — and that trade is exactly the judgment being
 * delegated.
 */
export function keepQuestion(view: ClientView, keeps: readonly KeepOption[]): KeepChoice {
  const options = new Map<string, KeepOption>();
  const criteria: Record<string, Described> = {};

  for (const option of keeps.slice(0, MAX_OPTIONS)) {
    const name = optionName(option, new Set(options.keys()));
    options.set(name, option);
    criteria[name] = optionCriteria(view, option);
  }

  const question: ChoiceQuestion = {
    type: 'choice',
    instructions: {
      task:
        'You are the player named in state.match.you, and it is your turn. The dice in ' +
        'state.this_turn.the_throw_in_front_of_you have just been thrown, and you must set at ' +
        'least one scoring die aside. Every legal way to do that is listed as an option, with ' +
        'its points already totalled, what it leaves in play, and how likely the next throw is ' +
        'to farkle if you take it.',
      how_to_choose:
        'Choose what best serves winning the match — not what is worth the most points. Keeping ' +
        'fewer points to leave more dice in play is often correct, because the fewer dice are ' +
        'left, the likelier the next throw scores nothing and costs you the whole turn. How far ' +
        'each side is from the target, and how the opponent has been playing, should change how ' +
        'much risk is worth taking.',
      how_the_risk_scales: WORKED_EXAMPLES.risk,
      worked_examples: WORKED_EXAMPLES.keeps,
    },
    criteria,
  };

  return { question, options };
}

/**
 * The press-or-bank decision, as a Noul: one claim, and how strongly it
 * holds. A Choice between two options would do the same job, but a Noul's
 * single number is easier to put a deadband around — see `JevBot`'s
 * `pressDeadband`.
 */
export function pressQuestion(view: ClientView): NoulQuestion {
  const you = view.players[view.you]!;
  const bankedTotal = you.total + view.turnScore;
  const hot = view.diceInPlay === DICE_PER_TURN && view.keptThisTurn.length > 0;
  const dice = view.inPlayDice;

  return {
    type: 'noul',
    instructions: [
      'You are the player named in state.match.you. You have just set dice aside,',
      `and you hold ${view.turnScore} points this turn that are not yet banked.`,
      hot
        ? `You cleared the table, so all ${countWord(DICE_PER_TURN)} dice come back.`
        : `${countWord(view.diceInPlay)} dice are still in play: ${describeDice(dice)}.`,
      `The chance that throwing them scores nothing — and loses all ${view.turnScore} —`,
      `is ${bustRisk(dice)}.`,
      `Banking now would put you on ${bankedTotal}, ` +
        (bankedTotal >= view.target
          ? 'which reaches the target and wins the match outright.'
          : `${view.target - bankedTotal} short of the target.`),
      'The claim to judge: throwing again is the better play than banking now.',
    ],
    criteria: {
      true: { definition: WORKED_EXAMPLES.press.throw, also_consider: WORKED_EXAMPLES.press.race },
      false: { definition: WORKED_EXAMPLES.press.bank, also_consider: WORKED_EXAMPLES.press.race },
    },
  };
}
