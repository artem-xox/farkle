import { DICE, type DieSpec } from '@farkle/engine';

const DICE_LIST: readonly DieSpec[] = Object.values(DICE);

export interface LoadoutPickerProps {
  label: string;
  loadout: readonly DieSpec[];
  onChange: (loadout: DieSpec[]) => void;
  disabled?: boolean;
}

/**
 * Six slots, each an independent choice from the die collection — the
 * loadout screen from docs/PLAN.md M5. Kept to just the choice itself; the
 * full face-by-face odds for every die live on the Rules screen instead, so
 * this stays a quick pick rather than a second stats page.
 */
export function LoadoutPicker({ label, loadout, onChange, disabled = false }: LoadoutPickerProps) {
  function setSlot(index: number, dieId: string): void {
    const die = DICE[dieId];
    if (die === undefined) {
      return;
    }
    const next = [...loadout];
    next[index] = die;
    onChange(next);
  }

  return (
    <div className="loadout">
      <span className="field__label">{label}</span>
      <div className="loadout__slots">
        {loadout.map((die, index) => (
          <div className="loadout-slot" key={index}>
            <span className={`loadout-slot__swatch loadout-slot__swatch--${die.id}`} aria-hidden="true" />
            <select
              className="loadout-slot__select"
              value={die.id}
              disabled={disabled}
              aria-label={`Die ${index + 1}`}
              onChange={(event) => setSlot(index, event.target.value)}
            >
              {DICE_LIST.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
