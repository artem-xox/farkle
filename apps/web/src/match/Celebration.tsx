import { useState, type CSSProperties } from 'react';

/**
 * Enough to read as a burst, few enough to stay a flourish rather than a
 * cutscene — the overlay underneath is a card with two buttons on it, and the
 * player is meant to be reading it, not waiting out an animation.
 */
const PIECE_COUNT = 26;

/** The game's own palette. Confetti in colours the rest of the table doesn't use would read as belonging to some other app. */
const COLOURS = ['#e6b84f', '#c8952e', '#f3e9d2', '#6fbf87', '#e69a9a', '#b8503f'];

interface Piece {
  readonly style: CSSProperties;
}

const between = (min: number, max: number): number => min + Math.random() * (max - min);

/**
 * One piece's whole flight, as custom properties the keyframes read. Built in
 * JS rather than as a handful of CSS nth-child variants because the point is
 * that no two pieces travel alike — a burst with a visible repeating pattern
 * stops looking like a burst.
 */
function makePiece(): Piece {
  // Biased upward and outward: the card sits over the origin, so a piece that
  // does not clear it is a piece nobody sees.
  const spread = between(70, 260) * (Math.random() < 0.5 ? -1 : 1);
  return {
    style: {
      '--drift': `${spread.toFixed(1)}px`,
      '--rise': `${between(90, 210).toFixed(1)}px`,
      '--fall': `${between(150, 320).toFixed(1)}px`,
      '--spin': `${between(-540, 540).toFixed(0)}deg`,
      '--size': `${between(5, 9).toFixed(1)}px`,
      '--colour': COLOURS[Math.floor(Math.random() * COLOURS.length)]!,
      '--delay': `${between(0, 260).toFixed(0)}ms`,
      '--duration': `${between(1100, 1700).toFixed(0)}ms`,
    } as CSSProperties,
  };
}

/**
 * A one-shot confetti burst behind the match-over card, for a match the player
 * actually won.
 *
 * Two nested elements per piece because a single transform cannot carry two
 * different easings: the outer drifts sideways at a constant slowdown while
 * the inner rises and then falls under something that looks like gravity.
 * Doing both on one element gets a straight diagonal line, which reads as a
 * slide rather than a throw.
 */
export function Celebration() {
  // Randomised once per mount: the overlay re-renders on hover and focus, and
  // re-rolling the flights each time would restart the burst mid-air.
  const [pieces] = useState<readonly Piece[]>(() =>
    Array.from({ length: PIECE_COUNT }, () => makePiece()),
  );

  return (
    <div className="celebration" aria-hidden="true">
      {pieces.map((piece, index) => (
        <span className="celebration__piece" key={index} style={piece.style}>
          <span className="celebration__flake" />
        </span>
      ))}
    </div>
  );
}
