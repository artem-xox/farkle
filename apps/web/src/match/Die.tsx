import { isWild, type Face, type Pip } from '@farkle/engine';

import { DevilFace } from './DevilFace';
import { TUMBLE_MS } from './pacing';

/**
 * Dice whose specific type gets its own matte colour, so a loadout mixing
 * dice reads at a glance rather than only when a Devil's Head happens to be
 * showing. Only the ordinary die is absent: it keeps the plain
 * parchment-and-black look below as the "nothing special" baseline, and it
 * is the one die that has to stay visually distinct from every other.
 */
const IDENTITY_DICE = new Set([
  'weighted',
  'devil',
  'king',
  'imp',
  'odd',
  'even',
  'cheat',
  'trader',
  'trinity',
  'twins',
  'unbalanced',
  'worn',
  'unlucky',
]);

/** One-word hover label per die type, keyed by `DieSpec.id`. */
const DIE_TYPE_LABEL: Record<string, string> = {
  balanced: 'Ordinary',
  weighted: 'Weighted',
  devil: 'Devil',
  king: 'King',
  imp: 'Imp',
  odd: 'Odd',
  even: 'Even',
  cheat: 'Cheat',
  trader: 'Trader',
  trinity: 'Trinity',
  twins: 'Twins',
  unbalanced: 'Unbalanced',
  worn: 'Worn',
  unlucky: 'Unlucky',
};

/** Classic six-sided pip layout on a 3×3 grid, indices 0–8 row-major. */
const PIP_LAYOUTS: Record<Pip, readonly number[]> = {
  1: [4],
  2: [2, 6],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export type DieTone = 'default' | 'selected' | 'kept' | 'dead';

export interface DieProps {
  face: Face;
  /** Which die spec rolled this face, e.g. `'devil'` — drives the matte identity colour. Unknown when not tracked (a farkle hold). */
  dieId?: string;
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

export function Die({
  face,
  dieId,
  tumbling = false,
  tone = 'default',
  disabled = false,
  onClick,
}: DieProps) {
  const wild = isWild(face);
  const interactive = onClick !== undefined;
  const identity = dieId !== undefined && IDENTITY_DICE.has(dieId) ? dieId : null;
  const className = [
    'die',
    identity !== null ? `die--id-${identity}` : '',
    wild ? 'die--wild' : '',
    tone !== 'default' ? `die--${tone}` : '',
    tumbling ? 'die--tumbling' : '',
    interactive ? '' : 'die--static',
  ]
    .filter(Boolean)
    .join(' ');

  const content = wild ? (
    <span className="die__wild" aria-hidden="true">
      <DevilFace variant={dieId === 'imp' ? 'imp' : 'devil'} />
    </span>
  ) : (
    <span className="die__pips">
      {Array.from({ length: 9 }, (_, cell) => {
        const active = new Set(PIP_LAYOUTS[face]).has(cell);
        return <span key={cell} className={`die__pip${active ? ' die__pip--on' : ''}`} />;
      })}
    </span>
  );

  const label = wild ? "die showing the Devil's Head" : `die showing ${face}`;
  const typeLabel = dieId !== undefined ? DIE_TYPE_LABEL[dieId] : undefined;

  if (!interactive) {
    return (
      <span
        className={className}
        style={tumbling ? { animationDuration: `${TUMBLE_MS}ms` } : undefined}
        aria-label={label}
        title={typeLabel}
        role="img"
      >
        {content}
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
      aria-label={label}
      title={typeLabel}
    >
      {content}
    </button>
  );
}
