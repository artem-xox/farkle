export interface CrownFaceProps {
  variant?: 'king' | 'queen';
}

/**
 * A small hand-drawn crown for the King's and Queen's wildcard pip —
 * RULES.md §12 names the face itself "a Crown," never "the Devil's Head", so
 * it earns its own drawing rather than reusing `DevilFace` under a new
 * colour. Same in-house, no-emoji reasoning as `DevilFace`: a crown emoji
 * renders inconsistently across platforms at the ~20px a die shows it at.
 *
 * Solid gold with a black outline, identical between King and Queen: an
 * earlier version tinted the crown body to match each die's own colour
 * (red on the King, green on the Queen), but that meant the pip nearly
 * vanished into its own die — gold-on-red and gold-on-green both read
 * clearly, red-on-red and green-on-green don't.
 */
export function CrownFace(_props: CrownFaceProps) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <polygon
        points="4,18 4,10 8,13.5 12,6 16,13.5 20,10 20,18"
        fill="#e6b84f"
        stroke="#1a1208"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <rect x="3.2" y="17.2" width="17.6" height="3.4" rx="1" fill="#e6b84f" stroke="#1a1208" strokeWidth="0.9" />
      <circle cx="4" cy="9.4" r="1.5" fill="#fff3d1" stroke="#1a1208" strokeWidth="0.6" />
      <circle cx="12" cy="5.2" r="1.7" fill="#fff3d1" stroke="#1a1208" strokeWidth="0.6" />
      <circle cx="20" cy="9.4" r="1.5" fill="#fff3d1" stroke="#1a1208" strokeWidth="0.6" />
      <circle cx="12" cy="18.9" r="1.15" fill="#1a1208" />
    </svg>
  );
}
