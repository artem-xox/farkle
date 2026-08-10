import { DICE, faceProbabilities, type DieSpec } from '@farkle/engine';

import { Die } from '../match/Die';
import { DIE_DESCRIPTIONS } from './descriptions';

const DICE_LIST: readonly DieSpec[] = Object.values(DICE);

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
    </article>
  );
}

function DieCard({ die }: { die: DieSpec }) {
  const probabilities = faceProbabilities(die);
  return (
    <div className="dice-stats__card">
      <div className="dice-stats__heading">
        <Die face={1} dieId={die.id} />
        <div className="dice-stats__heading-text">
          <span className="dice-stats__name">{die.name}</span>
          <span className="dice-stats__description">{DIE_DESCRIPTIONS[die.id]}</span>
        </div>
      </div>

      <div className="die-distribution" aria-hidden="true">
        {probabilities.map((probability, index) => {
          const pip = index + 1;
          const wild = die.wild === pip;
          const percent = probability * 100;
          return (
            <div
              className="die-distribution__slot"
              key={pip}
              title={`${wild ? "Devil's Head" : pip}: ${percent.toFixed(1)}%`}
            >
              <div className="die-distribution__track">
                <div
                  className={`die-distribution__bar${wild ? ' die-distribution__bar--wild' : ''}`}
                  style={{ height: `${percent}%` }}
                />
              </div>
              <span className="die-distribution__face">{wild ? '😈' : pip}</span>
              <span className="die-distribution__percent">{percent.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
