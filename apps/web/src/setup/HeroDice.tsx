import { useState } from 'react';

import type { Pip } from '@farkle/engine';

import { Die } from '../match/Die';

const HERO_DICE = 3;

/**
 * Decorative only, so `Math.random` rather than the engine's seeded RNG —
 * nothing here feeds a match, and borrowing `RngState` would imply it might.
 */
const randomFaces = (): Pip[] =>
  Array.from({ length: HERO_DICE }, () => (1 + Math.floor(Math.random() * 6)) as Pip);

/**
 * Three dice that tumble in on load and re-roll when tapped. The setup screen
 * is otherwise a form, and a dice game whose first screen contains no dice
 * sells itself badly — this is the cheapest fix that is still honest, since
 * what it shows is a throw and nothing more.
 */
export function HeroDice() {
  const [roll, setRoll] = useState(() => ({ id: 0, faces: randomFaces() }));

  return (
    <button
      type="button"
      className="hero-dice"
      onClick={() => setRoll((previous) => ({ id: previous.id + 1, faces: randomFaces() }))}
      aria-label="Roll the dice"
    >
      {/* The key carries the roll number so a re-roll remounts each die and replays the tumble. */}
      {roll.faces.map((face, index) => (
        <Die key={`${roll.id}-${index}`} face={face} tumbling />
      ))}
    </button>
  );
}
