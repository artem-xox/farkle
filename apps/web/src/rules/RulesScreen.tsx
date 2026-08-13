import { CROWN_MULTIPLIER, DICE, WILD, WILD_KING, WILD_QUEEN, type DieSpec, type Face } from '@farkle/engine';

import { iconicFace } from '../dice/descriptions';
import { diceGlyphs } from '../match/logEntry';
import { Die } from '../match/Die';

const DICE_LIST: readonly DieSpec[] = Object.values(DICE);
const WILDCARD_DICE: readonly DieSpec[] = DICE_LIST.filter((die) => die.wild !== undefined);

interface ScoreRow {
  readonly combination: string;
  readonly value: string;
}

const SINGLES: ScoreRow[] = [
  { combination: 'A single 1', value: '100' },
  { combination: 'A single 5', value: '50' },
];

const TRIPLES: ScoreRow[] = [
  { combination: 'Three 1s', value: '1000' },
  { combination: 'Three 2s', value: '200' },
  { combination: 'Three 3s', value: '300' },
  { combination: 'Three 4s', value: '400' },
  { combination: 'Three 5s', value: '500' },
  { combination: 'Three 6s', value: '600' },
];

const EXTRAS: ScoreRow[] = [
  { combination: 'Four of a kind', value: 'triple × 2' },
  { combination: 'Five of a kind', value: 'triple × 4' },
  { combination: 'Six of a kind', value: 'triple × 8' },
];

const STRAIGHTS: ScoreRow[] = [
  { combination: '1-2-3-4-5', value: '500' },
  { combination: '2-3-4-5-6', value: '750' },
  { combination: '1-2-3-4-5-6', value: '1500' },
];

interface Synergy {
  readonly id: string;
  readonly title: string;
  readonly diceIds: readonly string[];
  readonly description: string;
}

/**
 * Interactions between two or more specific dice, as opposed to a single
 * die's own stats. One entry today (the Crown Bonus) — a list rather than a
 * hardcoded section so the next synergy is another array entry, not a new
 * block of markup.
 */
const SYNERGIES: readonly Synergy[] = [
  {
    id: 'crown-bonus',
    title: "King & Queen — the Crown Bonus",
    diceIds: ['king', 'queen'],
    description: `A kept combination that resolves both a King's crown and a Queen's crown at once has its points multiplied ${CROWN_MULTIPLIER}×. Two crowns alone are not a combination by themselves — the bonus multiplies a keep's value, it does not create one — and it never fires for two Devil's Heads or a King paired with a Devil's Head; it takes one of each crown specifically.`,
  },
];

interface Example {
  readonly id: string;
  readonly faces: readonly Face[];
  readonly reading: string;
  readonly points: string;
}

/**
 * Ordinary combinations first, then a wildcard and a synergy example last —
 * this list is what "Reading a throw" closes the page on, so by the time a
 * reader hits it they've already met wildcards and the Crown Bonus above and
 * can see the same reading-the-highest-score logic apply to all three.
 */
const EXAMPLES: readonly Example[] = [
  {
    id: 'straight-plus-single',
    faces: [1, 2, 3, 4, 5, 5],
    reading: 'A 1–5 straight, plus the spare 5 on its own',
    points: '550',
  },
  {
    id: 'two-triples',
    faces: [1, 1, 1, 5, 5, 5],
    reading: 'Three 1s and three 5s — two separate triples, simply added',
    points: '1500',
  },
  {
    id: 'four-of-a-kind',
    faces: [5, 5, 5, 5],
    reading: 'Four 5s is one combination, worth double the triple — not 500 + 50',
    points: '1000',
  },
  {
    id: 'three-pairs-farkle',
    faces: [2, 2, 3, 3, 4, 4],
    reading: 'Nothing at all. Three pairs do not score in this variant',
    points: 'Farkle',
  },
  {
    id: 'wildcard-triple',
    faces: [6, 6, WILD],
    reading: "A Devil's Head resolves to whichever face helps most — here, a third 6, not a lone wildcard",
    points: '600',
  },
  {
    id: 'crown-bonus',
    faces: [6, 6, 6, WILD_KING, WILD_QUEEN],
    reading: "Five 6s (two crowns filling in), and a King's crown plus a Queen's crown both drawn into it — the Crown Bonus doubles the whole keep, not just the crowns' share",
    points: '4800',
  },
];

function ScoreTable({ rows, caption }: { rows: readonly ScoreRow[]; caption: string }) {
  return (
    <div className="rules__table-block">
      <h3 className="rules__table-caption">{caption}</h3>
      <table className="rules__table">
        <tbody>
          {rows.map((row) => (
            <tr key={row.combination}>
              <th scope="row">{row.combination}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RulesScreen() {
  return (
    <article className="rules">
      <header className="rules__header">
        <h1>How to play</h1>
        <p className="rules__lede">
          Farkle, as played in <em>Kingdom Come: Deliverance II</em>. Six dice, a running score, and
          the constant question of whether to push your luck one more throw.
        </p>
      </header>

      <section className="rules__section">
        <h2>The goal</h2>
        <p>
          Be the first to <strong>bank</strong> the target score. Points you have scored during a
          turn are only yours once you bank them — until then, a single bad throw takes all of them
          away.
        </p>
      </section>

      <section className="rules__section">
        <h2>A turn, step by step</h2>
        <ol className="rules__steps">
          <li>
            <strong>Throw</strong> every die still in play — six of them at the start of a turn.
          </li>
          <li>
            <strong>Set aside</strong> at least one scoring die. You may take more than the minimum,
            but every die you keep has to be part of a scoring combination — you cannot keep a stray
            die just to get rid of it.
          </li>
          <li>
            <strong>Bank or throw again.</strong> Banking adds the turn's score to your total and
            passes play on. Throwing again risks all of it for the chance at more.
          </li>
        </ol>
      </section>

      <section className="rules__section rules__section--warn">
        <h2>Farkle</h2>
        <p>
          If a throw contains no scoring dice at all, you <strong>farkle</strong>: the turn ends
          immediately and everything you had set aside that turn is lost. Only banked points are
          safe.
        </p>
      </section>

      <section className="rules__section rules__section--good">
        <h2>Hot dice</h2>
        <p>
          Use all six dice in scoring combinations and you get all six back, with your turn score
          carried over. There is no limit to how many times this can happen in a turn — and no
          obligation to take it. You may bank instead.
        </p>
      </section>

      <section className="rules__section">
        <h2>Scoring</h2>
        <div className="rules__tables">
          <ScoreTable rows={SINGLES} caption="On their own" />
          <ScoreTable rows={TRIPLES} caption="Three of a kind" />
          <ScoreTable rows={EXTRAS} caption="More of a kind" />
          <ScoreTable rows={STRAIGHTS} caption="Straights" />
        </div>
        <p className="rules__note">
          Each die beyond a triple doubles that triple's value, so four 1s are 2000, five are 4000,
          and all six are 8000 — enough to win most matches outright in a single throw.
        </p>
      </section>

      <section className="rules__section">
        <h2>Nothing else scores</h2>
        <p>
          A lone 2, 3, 4 or 6 is worth nothing, and pairs never score. Notably, and unlike the first{' '}
          <em>Kingdom Come</em> and most tabletop Farkle: <strong>three pairs</strong>,{' '}
          <strong>two triplets</strong> and <strong>four of a kind plus a pair</strong> have no
          special value here. A throw like ⚁ ⚁ ⚂ ⚂ ⚃ ⚃ is simply a farkle.
        </p>
      </section>

      <section className="rules__section">
        <h2>Wildcard dice</h2>
        <p>
          Some dice paint one physical face as a <strong>wildcard</strong> — a Devil's Head 😈, or a
          crown 👑 for King and Queen — instead of a printed pip. Rolling it doesn't produce a fixed
          value: scoring resolves it to whichever face makes the keep worth the most.
        </p>
        <p>
          A wildcard can never complete a lone <strong>1</strong> or <strong>5</strong> by itself —
          only a three-or-more-of-a-kind or a straight. A throw where the only wildcard has nothing to
          combine with farkles exactly as if it had rolled a dead face, and several wildcards together
          can complete a combination entirely among themselves.
        </p>
        <div className="dice-synergy__dice" aria-hidden="true">
          {WILDCARD_DICE.map((die) => (
            <Die key={die.id} face={iconicFace(die)} dieId={die.id} />
          ))}
        </div>
      </section>

      <section className="rules__section">
        <h2>Synergies</h2>
        <p>Some dice do more together than the sum of their own stats. Currently shipped:</p>
        <ul className="dice-synergy__list">
          {SYNERGIES.map((synergy) => (
            <li key={synergy.id} className="dice-synergy__item">
              <div className="dice-synergy__dice" aria-hidden="true">
                {synergy.diceIds.map((id) => {
                  const die = DICE[id]!;
                  return <Die key={id} face={iconicFace(die)} dieId={die.id} />;
                })}
              </div>
              <div className="dice-synergy__text">
                <h3 className="dice-synergy__title">{synergy.title}</h3>
                <p>{synergy.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rules__section">
        <h2>Reading a throw</h2>
        <p>
          A set of dice is always read the way that scores highest, which is not always the obvious
          split — the same rule applies whether every die is ordinary, a wildcard is involved, or a
          synergy like the Crown Bonus is in play.
        </p>
        <ul className="rules__examples">
          {EXAMPLES.map((example) => (
            <li key={example.id} className="rules__example">
              <span className="rules__example-dice">{diceGlyphs(example.faces)}</span>
              <span className="rules__example-reading">{example.reading}</span>
              <span className="rules__example-points">{example.points}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
