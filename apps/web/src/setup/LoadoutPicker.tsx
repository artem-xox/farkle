import { useState } from 'react';

import { BALANCED_DIE, DICE, type DieSpec } from '@farkle/engine';

import { DIE_DESCRIPTIONS, iconicFace } from '../dice/descriptions';
import { DIE_STATS, powerRating, riskRating, TIER_ICON, TIER_LABEL, TIER_ORDER, type DieTier } from '../dice/stats';
import { Die } from '../match/Die';

const RATING_SCALE = 10;

/** Weakest to strongest tier, and by win6 within a tier — a catalog you can browse top to bottom as a difficulty curve. */
const DICE_BY_TIER: readonly { tier: DieTier; dice: readonly DieSpec[] }[] = TIER_ORDER.map((tier) => ({
  tier,
  dice: Object.values(DICE)
    .filter((die) => DIE_STATS[die.id].tier === tier)
    .sort((a, b) => DIE_STATS[a.id].win6 - DIE_STATS[b.id].win6),
}));

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
 * the description, the tier and the two stat bars on each card are for.
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

  return (
    <div className="loadout">
      <span className="field__label">{label}</span>

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
            {DICE_BY_TIER.map(({ tier, dice }) => (
              <div className="loadout__tier-group" key={tier}>
                <div className="loadout__tier-heading">
                  <span aria-hidden="true">{TIER_ICON[tier]}</span>
                  <span>{TIER_LABEL[tier]}</span>
                </div>

                <div className="loadout__tier-cards">
                  {dice.map((option) => {
                    const risk = riskRating(option.id);
                    const power = powerRating(option.id);
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
                                  style={{ width: `${Math.max(6, (risk / RATING_SCALE) * 100)}%` }}
                                />
                              </span>
                            </span>
                            <span className="stat-bar stat-bar--power">
                              <span className="stat-bar__label">Power</span>
                              <span className="stat-bar__track">
                                <span
                                  className="stat-bar__fill"
                                  style={{ width: `${Math.max(6, (power / RATING_SCALE) * 100)}%` }}
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
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
