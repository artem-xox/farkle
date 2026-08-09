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

export type DieTone = 'default' | 'staged' | 'kept' | 'dead';

export interface DieProps {
  face: Face;
  /**
   * Play the tumble-in animation. Only true for dice that just landed on the
   * board: a die moving between the board and the set-aside rail remounts, and
   * without this it would re-tumble on every click.
   */
  tumbling?: boolean;
  tone?: DieTone;
  disabled?: boolean;
  onClick?: () => void;
}

export function Die({ face, tumbling = false, tone = 'default', disabled = false, onClick }: DieProps) {
  const active = new Set(PIP_LAYOUTS[face]);
  const interactive = onClick !== undefined;
  const className = [
    'die',
    tone !== 'default' ? `die--${tone}` : '',
    tumbling ? 'die--tumbling' : '',
    interactive ? '' : 'die--static',
  ]
    .filter(Boolean)
    .join(' ');

  const pips = (
    <span className="die__pips">
      {Array.from({ length: 9 }, (_, cell) => (
        <span key={cell} className={`die__pip${active.has(cell) ? ' die__pip--on' : ''}`} />
      ))}
    </span>
  );

  if (!interactive) {
    return (
      <span
        className={className}
        style={tumbling ? { animationDuration: `${TUMBLE_MS}ms` } : undefined}
        aria-label={`die showing ${face}`}
        role="img"
      >
        {pips}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      style={tumbling ? { animationDuration: `${TUMBLE_MS}ms` } : undefined}
      disabled={disabled}
      onClick={onClick}
      aria-label={`die showing ${face}`}
    >
      {pips}
    </button>
  );
}
