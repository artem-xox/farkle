import type { Face } from '@farkle/engine';

import { TUMBLE_MS } from './pacing';

/** Classic six-sided pip layout on a 3×3 grid, indices 0–8 row-major. */
const PIP_LAYOUTS: Record<Face, readonly number[]> = {
  1: [4],
  2: [2, 6],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export interface DieProps {
  face: Face;
  selected: boolean;
  disabled: boolean;
  onClick?: () => void;
}

export function Die({ face, selected, disabled, onClick }: DieProps) {
  const active = new Set(PIP_LAYOUTS[face]);
  return (
    <button
      type="button"
      className={`die${selected ? ' die--selected' : ''}`}
      style={{ animationDuration: `${TUMBLE_MS}ms` }}
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`die showing ${face}`}
    >
      <span className="die__pips">
        {Array.from({ length: 9 }, (_, cell) => (
          <span key={cell} className={`die__pip${active.has(cell) ? ' die__pip--on' : ''}`} />
        ))}
      </span>
    </button>
  );
}
