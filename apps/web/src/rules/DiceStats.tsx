import { DICE, faceProbabilities, type DieSpec } from '@farkle/engine';

const DICE_LIST: readonly DieSpec[] = Object.values(DICE);

/**
 * Every die's exact per-face odds, read honestly off its weights rather than
 * described by a rarity label — the loadout picker (setup/LoadoutPicker.tsx)
 * only offers the choice; this is where the tradeoffs actually live.
 */
export function DiceStats() {
  return (
    <div className="dice-stats">
      {DICE_LIST.map((die) => (
        <DieStatCard key={die.id} die={die} />
      ))}
    </div>
  );
}

function DieStatCard({ die }: { die: DieSpec }) {
  const probabilities = faceProbabilities(die);
  return (
    <div className="dice-stats__card">
      <div className="dice-stats__heading">
        <span className={`loadout-slot__swatch loadout-slot__swatch--${die.id}`} aria-hidden="true" />
        <span className="dice-stats__name">{die.name}</span>
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
              <span className="die-distribution__face">{wild ? '👿' : pip}</span>
              <span className="die-distribution__percent">{percent.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
