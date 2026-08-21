import { useEffect, useRef, type CSSProperties } from 'react';

import { PRESET_NAMES, type PresetName } from '@farkle/bots';

import { capitalize } from '../presets';
import { BOT_COLORS, BotIcon } from './botIcons';

/** One-line pitch per personality, kept short enough to fit a card at its fixed width. */
const BOT_TAGLINES: Record<PresetName, string> = {
  cautious: 'Banks early, plays it safe',
  balanced: 'A sensible, all-round player',
  aggressive: 'Chases big turns, risks a lot',
  reckless: 'A gambler who always takes hot dice',
  novice: 'Friendly and beatable — slips up',
  smart: 'Plays the exact odds — the best bot',
};

/**
 * The gentle wave the cards float in: a vertical offset and a slight tilt per
 * slot, so the gallery reads as cards drifting on the felt rather than a flat
 * row. Wraps around, and the index used is the card's position in the list.
 */
const FLOAT_WAVE: readonly { readonly rise: number; readonly tilt: number }[] = [
  { rise: 2, tilt: -2 },
  { rise: 6, tilt: 1.2 },
  { rise: 9, tilt: -1 },
  { rise: 5, tilt: 1.6 },
  { rise: 1, tilt: -1.4 },
  { rise: 7, tilt: 0.8 },
];

export interface PersonalityGalleryProps {
  readonly value: PresetName;
  readonly onChange: (name: PresetName) => void;
}

/**
 * The bot picker, as a floating gallery instead of the native select it
 * replaced — PLAN.md M5.1's "icon per playstyle" idea, finally built.
 *
 * Each personality is a circular medallion (its hand-drawn icon in an accent
 * ring) with the name and a one-line pitch sitting directly on the felt — no
 * card panel or boxy drop shadow, so the row reads as tokens drifting over
 * the table rather than boxes on a shelf. The medallions bob in a gentle
 * wave, and the strip scrolls horizontally with snap so the whole roster is
 * reachable by swiping on a phone. Selecting one lifts and glows it in its
 * own accent colour and pins a check to its corner; the accents also color
 * every medallion's ring, so the six personalities stay distinguishable even
 * mid-swipe.
 */
export function PersonalityGallery({ value, onChange }: PersonalityGalleryProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const cards = useRef(new Map<PresetName, HTMLButtonElement>());
  // The first run centers the remembered personality without animating; every
  // later run is a tap, so it slides the chosen card into the middle.
  const firstRun = useRef(true);

  /**
   * Centers a card in the strip by scrolling the strip itself, never the
   * page — `scrollIntoView` would scroll the document too, which on a phone
   * yanks the whole setup form up the moment the screen loads.
   */
  function centerCard(name: PresetName, smooth: boolean): void {
    const track = trackRef.current;
    const card = cards.current.get(name);
    if (track === null || card === undefined) {
      return;
    }
    const trackRect = track.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const target =
      track.scrollLeft + (cardRect.left - trackRect.left) - (trackRect.width - cardRect.width) / 2;
    track.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' });
  }

  // Snap is mandatory, so a card tapped at the strip's edge would otherwise
  // end up half off-screen; recenter it after the choice lands. The strip
  // must not recenter while the player is merely browsing, so only the choice
  // itself is a dependency.
  useEffect(() => {
    centerCard(value, !firstRun.current);
    firstRun.current = false;
  }, [value]);

  return (
    <div className="field">
      <span className="field__label" id="personality-label">
        Personality
      </span>
      <div className="personality" role="radiogroup" aria-labelledby="personality-label">
        <div className="personality__track" ref={trackRef}>
          {PRESET_NAMES.map((name, index) => {
            const active = name === value;
            const colors = BOT_COLORS[name];
            const wave = FLOAT_WAVE[index % FLOAT_WAVE.length];
            return (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={active}
                ref={(node) => {
                  if (node !== null) {
                    cards.current.set(name, node);
                  } else {
                    cards.current.delete(name);
                  }
                }}
                className={`personality__card${active ? ' personality__card--active' : ''}`}
                style={
                  {
                    '--i': index,
                    '--rise': `${wave.rise}px`,
                    '--tilt': `${wave.tilt}deg`,
                    '--accent': colors.accent,
                    '--glow': colors.glow,
                  } as CSSProperties
                }
                onClick={() => onChange(name)}
              >
                <span className="personality__medal">
                  <BotIcon id={name} />
                  {active && (
                    <span className="personality__check" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="100%" height="100%">
                        <path
                          d="M5.5 12.5 L10 17 L18.5 7.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  )}
                </span>
                <span className="personality__name">{capitalize(name)}</span>
                <span className="personality__tagline">{BOT_TAGLINES[name]}</span>
              </button>
            );
          })}
        </div>
        <p className="personality__hint">Swipe to browse &middot; tap to choose</p>
      </div>
    </div>
  );
}
