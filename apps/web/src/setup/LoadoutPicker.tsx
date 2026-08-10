import { useState } from 'react';

import { BALANCED_DIE, DICE, type DieSpec } from '@farkle/engine';

import { DIE_DESCRIPTIONS, iconicFace } from '../dice/descriptions';
import { barWidth, DIE_STATS, EV6_RANGE, FARKLE3_RANGE } from '../dice/stats';
import { Die } from '../match/Die';

const DICE_LIST: readonly DieSpec[] = Object.values(DICE);
const BASELINE_FARKLE3 = DIE_STATS[BALANCED_DIE.id].farkle3;

export interface LoadoutPickerProps {
  label: string;
  loadout: readonly DieSpec[];
  onChange: (loadout: DieSpec[]) => void;
  disabled?: boolean;
}

/**
 * A sticky six-slot rack up top, filled by clicking a die card below rather
 * than picking from six separate dropdowns — the loadout screen from
 * docs/PLAN.md M5. One slot is always "armed" (gold ring); clicking a card
 * fills it and arms the next one, wrapping back to the first slot after the
 * last, so the picker never goes dead the way it used to. Clicking any slot
 * directly re-arms it for editing. Full odds for every die live on the Dice
 * screen; this one only needs enough to compare at a glance, which is what
 * the description and the two stat bars on each card are for.
 */
export function LoadoutPicker({ label, loadout, onChange, disabled = false }: LoadoutPickerProps) {
  const [armed, setArmed] = useState<number | null>(disabled ? null : 0);

  function assign(dieId: string): void {
    if (disabled || armed === null) {
      return;
    }
    const die = DICE[dieId];
    if (die === undefined) {
      return;
    }
    const next = [...loadout];
    next[armed] = die;
    onChange(next);
    setArmed((armed + 1) % loadout.length);
  }

  function fillAll(dieId: string): void {
    if (disabled) {
      return;
    }
    const die = DICE[dieId];
    if (die === undefined) {
      return;
    }
    onChange(new Array(loadout.length).fill(die));
    setArmed(0);
  }

  function resetToOrdinary(): void {
    if (disabled) {
      return;
    }
    onChange(new Array(loadout.length).fill(BALANCED_DIE));
    setArmed(0);
  }

  const avgFarkle3 = loadout.reduce((sum, die) => sum + DIE_STATS[die.id].farkle3, 0) / loadout.length;

  return (
    <div className="loadout">
      <div className="loadout__head">
        <span className="field__label">{label}</span>
        {!disabled && (
          <span className="loadout__risk">
            Avg. farkle risk at 3 dice left: <strong>{Math.round(avgFarkle3 * 100)}%</strong>{' '}
            <span className="loadout__risk-baseline">(ordinary is {Math.round(BASELINE_FARKLE3 * 100)}%)</span>
          </span>
        )}
      </div>

      <div className={`loadout__slots${disabled ? '' : ' loadout__slots--sticky'}`}>
        {loadout.map((die, index) => (
          <button
            type="button"
            key={index}
            className={`loadout-slot${armed === index ? ' loadout-slot--armed' : ''}`}
            disabled={disabled}
            onClick={() => setArmed(index)}
            aria-pressed={armed === index}
            aria-label={`Slot ${index + 1}: ${die.name}`}
          >
            <Die face={iconicFace(die)} dieId={die.id} />
            <span className="loadout-slot__index" aria-hidden="true">
              {index + 1}
            </span>
          </button>
        ))}
      </div>

      {!disabled && (
        <>
          <p className="loadout__hint">
            {armed !== null
              ? `Slot ${armed + 1} of ${loadout.length} — tap a die below to place it here.`
              : 'Tap any slot above to edit it.'}
          </p>

          <div className="loadout__quick-actions">
            <button type="button" className="loadout__quick-action" onClick={resetToOrdinary}>
              Play with ordinary dice
            </button>
          </div>

          <div className="loadout__palette">
            {DICE_LIST.map((option) => {
              const stats = DIE_STATS[option.id];
              return (
                <div className="loadout-card" key={option.id}>
                  <button type="button" className="loadout-card__pick" onClick={() => assign(option.id)}>
                    <Die face={iconicFace(option)} dieId={option.id} />
                    <span className="loadout-card__text">
                      <span className="loadout-card__name">{option.name}</span>
                      <span className="loadout-card__description">{DIE_DESCRIPTIONS[option.id]}</span>
                    </span>
                    <span className="loadout-card__stats" aria-hidden="true">
                      <span className="stat-bar stat-bar--risk">
                        <span className="stat-bar__label">Risk</span>
                        <span className="stat-bar__track">
                          <span
                            className="stat-bar__fill"
                            style={{ width: `${Math.max(6, barWidth(stats.farkle3, FARKLE3_RANGE))}%` }}
                          />
                        </span>
                      </span>
                      <span className="stat-bar stat-bar--power">
                        <span className="stat-bar__label">Power</span>
                        <span className="stat-bar__track">
                          <span
                            className="stat-bar__fill"
                            style={{ width: `${Math.max(6, barWidth(stats.ev6, EV6_RANGE))}%` }}
                          />
                        </span>
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="loadout-card__fill-all"
                    aria-label={`Fill all six slots with the ${option.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      fillAll(option.id);
                    }}
                  >
                    Fill all 6
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
