/** Crown-body and gem colours, one palette per die — King reads red, Queen reads green, both trimmed in gold. */
const PALETTES = {
  king: { band: '#d4af37', body: '#7a1620', bodyDark: '#4a0d13', gem: '#ffd76a' },
  queen: { band: '#d4af37', body: '#0f5c33', bodyDark: '#0a3a20', gem: '#ffd76a' },
} as const;

export interface CrownFaceProps {
  variant?: keyof typeof PALETTES;
}

/**
 * A small hand-drawn crown for the King's and Queen's wildcard pip —
 * RULES.md §12 names the face itself "a Crown," never "the Devil's Head", so
 * it earns its own drawing rather than reusing `DevilFace` under a new
 * colour. Same in-house, no-emoji reasoning as `DevilFace`: a crown emoji
 * renders inconsistently across platforms at the ~20px a die shows it at,
 * and neither King nor Queen would read as distinct from the other in most
 * fonts. `variant` swaps both the body colour (this is what tells King and
 * Queen apart on the same drawing) and, faintly, the gem — everything else,
 * including the gold band and points, stays identical between the two.
 */
export function CrownFace({ variant = 'king' }: CrownFaceProps) {
  const { band, body, bodyDark, gem } = PALETTES[variant];
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <polygon
        points="4,18 4,10 8,13.5 12,6 16,13.5 20,10 20,18"
        fill={body}
        stroke={bodyDark}
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <rect x="3.2" y="17.2" width="17.6" height="3.4" rx="1" fill={band} />
      <circle cx="4" cy="9.4" r="1.5" fill={gem} />
      <circle cx="12" cy="5.2" r="1.7" fill={gem} />
      <circle cx="20" cy="9.4" r="1.5" fill={gem} />
      <circle cx="12" cy="18.9" r="1.15" fill={bodyDark} />
    </svg>
  );
}
