/** Horn/skin/feature colours for the wildcard face, one palette per die so the Devil and the Imp don't read as the same drawing. */
const PALETTES = {
  devil: { horn: '#6e2a1f', skin: '#e2836b', feature: '#4a1c14', eye: '#2c0f0a', teeth: '#fbf3e4' },
  imp: { horn: '#3f5a2a', skin: '#9dbf74', feature: '#26381a', eye: '#182410', teeth: '#f3f0df' },
} as const;

export interface DevilFaceProps {
  variant?: keyof typeof PALETTES;
}

/**
 * A small hand-drawn smiling devil face for the wildcard pip — drawn
 * in-house rather than relying on an emoji, whose devil glyphs render as
 * angry or inconsistent across platforms and don't read as "smiling" at the
 * ~20px size a die shows it at.
 *
 * `variant` recolours the same drawing rather than swapping in a different
 * shape: the Devil's Head die and the Imp's die are both this face by rule
 * (docs/RULES.md §4a calls the wildcard pip "the Devil's Head" regardless of
 * which die rolled it), so the drawing has to stay recognisably the same
 * face — only its colour tells the two dice apart.
 */
export function DevilFace({ variant = 'devil' }: DevilFaceProps) {
  const { horn, skin, feature, eye, teeth } = PALETTES[variant];
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <polygon points="5,9 8.5,9.5 6.5,2" fill={horn} />
      <polygon points="19,9 15.5,9.5 17.5,2" fill={horn} />
      <circle cx="12" cy="13" r="7.2" fill={skin} />
      <path d="M8,10.3 Q9.6,9 11.2,10.6" fill="none" stroke={feature} strokeWidth="1.15" strokeLinecap="round" />
      <path d="M16,10.3 Q14.4,9 12.8,10.6" fill="none" stroke={feature} strokeWidth="1.15" strokeLinecap="round" />
      <circle cx="9.6" cy="13.4" r="1.05" fill={eye} />
      <circle cx="14.4" cy="13.4" r="1.05" fill={eye} />
      <path d="M8.1,16 Q12,19.6 15.9,16" fill="none" stroke={feature} strokeWidth="1.3" strokeLinecap="round" />
      <polygon points="9.2,16.6 10.3,16.6 9.5,18.4" fill={teeth} />
      <polygon points="14.8,16.6 13.7,16.6 14.5,18.4" fill={teeth} />
      <polygon points="10.2,19.4 13.8,19.4 12,22" fill={horn} />
    </svg>
  );
}
