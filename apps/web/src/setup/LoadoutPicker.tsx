import { useState } from 'react';

import { DICE, type DieSpec } from '@farkle/engine';

import { Die } from '../match/Die';

const DICE_LIST: readonly DieSpec[] = Object.values(DICE);

export interface LoadoutPickerProps {
  label: string;
  loadout: readonly DieSpec[];
  onChange: (loadout: DieSpec[]) => void;
  disabled?: boolean;
}

/**
 * Six slots, filled by clicking a die in the collection below rather than
 * picking from six separate dropdowns — the loadout screen from
 * docs/PLAN.md M5. One slot is always "armed" (gold ring); clicking a die in
 * the collection fills it and arms the next one, so building a full loadout
 * is a run of quick clicks. Clicking any slot directly re-arms it for
 * editing. Full odds for every die live on the Dice screen instead of here.
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
    setArmed(armed + 1 < loadout.length ? armed + 1 : null);
  }

  return (
    <div className="loadout">
      <span className="field__label">{label}</span>

      <div className="loadout__slots">
        {loadout.map((die, index) => (
          <button
            type="button"
            key={index}
            className={`loadout-slot${armed === index ? ' loadout-slot--armed' : ''}`}
            disabled={disabled}
            onClick={() => setArmed(index)}
            aria-pressed={armed === index}
          >
            <Die face={1} dieId={die.id} />
            <span className="loadout-slot__name">{die.name}</span>
          </button>
        ))}
      </div>

      {!disabled && (
        <div className="loadout__palette">
          {DICE_LIST.map((option) => (
            <button
              type="button"
              key={option.id}
              className="loadout-palette__item"
              disabled={armed === null}
              onClick={() => assign(option.id)}
            >
              <Die face={1} dieId={option.id} />
              <span className="loadout-palette__name">{option.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
