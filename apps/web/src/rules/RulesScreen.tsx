import type { Face } from '@farkle/engine';

import { diceGlyphs } from '../match/logEntry';
import { DiceStats } from './DiceStats';

const dice = (text: string): Face[] => [...text].map((char) => Number(char) as Face);

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

interface Example {
  readonly throwText: string;
  readonly reading: string;
  readonly points: string;
}

const EXAMPLES: Example[] = [
  {
    throwText: '123455',
    reading: 'A 1–5 straight, plus the spare 5 on its own',
    points: '550',
  },
  {
    throwText: '111555',
    reading: 'Three 1s and three 5s — two separate triples, simply added',
    points: '1500',
  },
  {
    throwText: '555 5',
    reading: 'Four 5s is one combination, worth double the triple — not 500 + 50',
    points: '1000',
  },
  {
    throwText: '223344',
    reading: 'Nothing at all. Three pairs do not score in this variant',
    points: 'Farkle',
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
        <h2>Reading a throw</h2>
        <p>
          A set of dice is always read the way that scores highest, which is not always the obvious
          split.
        </p>
        <ul className="rules__examples">
          {EXAMPLES.map((example) => (
            <li key={example.throwText} className="rules__example">
              <span className="rules__example-dice">
                {diceGlyphs(dice(example.throwText.replace(/\s/g, '')))}
              </span>
              <span className="rules__example-reading">{example.reading}</span>
              <span className="rules__example-points">{example.points}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rules__section">
        <h2>Dice</h2>
        <p>
          Loadouts mix six dice from this collection — every one is an honest, unequal weighting of
          the six faces rather than a fair cube, shown here exactly rather than as a rarity label.
          The Devil&rsquo;s Head is a wildcard: it reads as whichever face makes the best keep, and a
          throw that includes one can never farkle outright.
        </p>
        <DiceStats />
      </section>
    </article>
  );
}
