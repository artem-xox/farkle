import type { Face, KeepOption } from '@farkle/engine';

import { describeCombos } from './describeCombo';
import { facesKey } from './selection';

export interface KeepOptionsProps {
  options: readonly KeepOption[];
  thrown: readonly Face[];
  selection: readonly number[];
  disabled: boolean;
  onPick: (option: KeepOption) => void;
}

/**
 * Every legal keep for the current throw, best first — clicking one commits
 * it immediately. Manual die-by-die selection (DiceTray) is the other path to
 * the same action; this one exists so "which combinations were read" is
 * always visible, not just implied by a live score (docs/PLAN.md M3).
 */
export function KeepOptions({ options, thrown, selection, disabled, onPick }: KeepOptionsProps) {
  if (options.length === 0) {
    return null;
  }
  const selectedKey = selection.length === 0 ? null : facesKey(selection.map((index) => thrown[index]!));

  return (
    <ul className="keep-options">
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
              <span className="keep-option__points">{option.points}</span>
              <span className="keep-option__detail">
                {describeCombos(option.combos)}
                {' · '}
                {option.diceLeft === 0 ? 'hot dice' : `${option.diceLeft} left`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
