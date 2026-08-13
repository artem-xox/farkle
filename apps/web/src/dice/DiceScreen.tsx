import { CROWN_MULTIPLIER, DICE, faceProbabilities, type DieSpec } from '@farkle/engine';

import { Die } from '../match/Die';
import { DIE_DESCRIPTIONS, iconicFace } from './descriptions';
import { DIE_STATS, powerRating, riskRating, TIER_ICON, TIER_LABEL } from './stats';

const DICE_LIST: readonly DieSpec[] = Object.values(DICE);
const WILDCARD_DICE: readonly DieSpec[] = DICE_LIST.filter((die) => die.wild !== undefined);

interface Synergy {
  readonly id: string;
  readonly title: string;
  readonly diceIds: readonly string[];
  readonly description: string;
}

/**
 * Interactions between two or more specific dice, as opposed to a single
 * die's own stats above. One entry today (the Crown Bonus) — a list rather
 * than a hardcoded section so the next synergy is another array entry, not
 * a new block of markup.
 */
const SYNERGIES: readonly Synergy[] = [
  {
    id: 'crown-bonus',
    title: "King & Queen — the Crown Bonus",
    diceIds: ['king', 'queen'],
    description: `A kept combination that resolves both a King's crown and a Queen's crown at once has its points multiplied ${CROWN_MULTIPLIER}×. Two crowns alone are not a combination by themselves — the bonus multiplies a keep's value, it does not create one — and it never fires for two Devil's Heads or a King paired with a Devil's Head; it takes one of each crown specifically.`,
  },
];

/**
 * The full die collection with exact, honest per-face odds — split out from
 * Rules onto its own page so it reads as reference material you look up
 * while building a loadout, not another rule to read top to bottom.
 */
export function DiceScreen() {
  return (
    <article className="dice-page">
      <header className="rules__header">
        <h1>Dice</h1>
        <p className="rules__lede">
          Every die in the collection, with its exact face-by-face odds — read off its real weights,
          not a rarity label. A loadout mixes six of these, one slot at a time.
        </p>
      </header>

      <div className="dice-stats">
        {DICE_LIST.map((die) => (
          <DieCard key={die.id} die={die} />
        ))}
      </div>

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
    </article>
  );
}

function DieCard({ die }: { die: DieSpec }) {
  const probabilities = faceProbabilities(die);
  const risk = riskRating(die.id);
  const power = powerRating(die.id);
  const tier = DIE_STATS[die.id]!.tier;
  return (
    <div className="dice-stats__card">
      <span className="dice-stats__tier-badge" title={`${TIER_LABEL[tier]} league`}>
        <span aria-hidden="true">{TIER_ICON[tier]}</span> {TIER_LABEL[tier]}
      </span>

      <div className="dice-stats__heading">
        <Die face={iconicFace(die)} dieId={die.id} />
        <div className="dice-stats__heading-text">
          <span className="dice-stats__name">{die.name}</span>
          <span className="dice-stats__description">{DIE_DESCRIPTIONS[die.id]}</span>
        </div>
      </div>

      <div className="dice-stats__ratings" aria-hidden="true">
        <RatingBar label="Risk" kind="risk" rating={risk} />
        <RatingBar label="Power" kind="power" rating={power} />
      </div>

      <div className="die-distribution" aria-hidden="true">
        {probabilities.map((probability, index) => {
          const pip = index + 1;
          const wild = die.wild === pip;
          const percent = probability * 100;
          const wildLabel = die.id === 'king' ? 'King' : die.id === 'queen' ? 'Queen' : "Devil's Head";
          const wildGlyph = die.id === 'king' || die.id === 'queen' ? '👑' : '😈';
          return (
            <div
              className="die-distribution__slot"
              key={pip}
              title={`${wild ? wildLabel : pip}: ${percent.toFixed(1)}%`}
            >
              <div className="die-distribution__track">
                <div
                  className={`die-distribution__bar${wild ? ' die-distribution__bar--wild' : ''}`}
                  style={{ height: `${percent}%` }}
                />
              </div>
              <span className="die-distribution__face">{wild ? wildGlyph : pip}</span>
              <span className="die-distribution__percent">{percent.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RATING_SCALE = 10;

/**
 * A die's Risk and Power, from `riskRating`/`powerRating` in `dice/stats.ts`
 * — the same numbers the loadout picker's stat bars are built from, so a die
 * reads the same on both screens. Risk is safety, not danger: higher is
 * better, the same direction as Power, which is why `worn` and `devil` both
 * end up near the top of their own bar. Shown to one decimal place since the
 * two anchor dice sit at a clean 9.0 and everything else is a fraction of
 * that; the raw rating can run past the 1–10 scale's ends (the anchors were
 * deliberately left short of them), so the bar's fill is clamped even
 * though the printed number isn't.
 */
function RatingBar({ label, kind, rating }: { label: string; kind: 'risk' | 'power'; rating: number }) {
  const fillPercent = Math.min(100, Math.max(0, (rating / RATING_SCALE) * 100));
  return (
    <span className={`dice-stats__rating dice-stats__rating--${kind}`}>
      <span className="dice-stats__rating-label">{label}</span>
      <span className="dice-stats__rating-track">
        <span className="dice-stats__rating-fill" style={{ width: `${fillPercent}%` }} />
      </span>
      <span className="dice-stats__rating-value">{rating.toFixed(1)}/{RATING_SCALE}</span>
    </span>
  );
}
