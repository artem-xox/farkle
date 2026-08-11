import type { Face, KeepOption } from '@farkle/engine';

import { describeCombos } from './describeCombo';
import { diceGlyphs } from './logEntry';
import { facesKey } from './selection';

export interface KeepOptionsProps {
  options: readonly KeepOption[];
  thrown: readonly Face[];
  selection: readonly number[];
  disabled: boolean;
  onPick: (option: KeepOption) => void;
}

/**
 * Every legal keep for the current throw, best first. Clicking one *selects*
 * those dice rather than committing them — committing now needs a second
 * choice (keep and throw, or keep and bank), so this is a shortcut for the
 * click-each-die path, not a separate way to act.
 *
 * It also exists so "which combinations were read" is always visible rather
 * than implied by a bare score (docs/PLAN.md M3).
 */
export function KeepOptions({ options, thrown, selection, disabled, onPick }: KeepOptionsProps) {
  if (options.length === 0) {
    return null;
  }
  const selectedKey = selection.length === 0 ? null : facesKey(selection.map((index) => thrown[index]!));

  return (
    <div className="keep-options">
      <span className="keep-options__label">
        Scoring combinations
        <span className="keep-options__nudge">tap to set aside</span>
      </span>
      <ul className="keep-options__list">
        {options.map((option) => {
          const active = selectedKey !== null && facesKey(option.faces) === selectedKey;
          return (
            <li key={facesKey(option.faces)}>
              <button
                type="button"
                className={`keep-option${active ? ' keep-option--active' : ''}`}
                disabled={disabled}
                onClick={() => onPick(option)}
              >
                <span className="keep-option__dice">{diceGlyphs(option.faces)}</span>
                <span className="keep-option__detail">{describeCombos(option.combos)}</span>
                <span className="keep-option__points">+{option.points}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
