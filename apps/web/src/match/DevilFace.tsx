/**
 * A small hand-drawn smiling devil face for the Devil's Head die — drawn
 * in-house rather than relying on an emoji, whose devil glyphs render as
 * angry or inconsistent across platforms and don't read as "smiling" at the
 * ~20px size a die shows it at.
 */
export function DevilFace() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <polygon points="5,9 8.5,9.5 6.5,2" fill="#6e2a1f" />
      <polygon points="19,9 15.5,9.5 17.5,2" fill="#6e2a1f" />
      <circle cx="12" cy="13" r="7.2" fill="#e2836b" />
      <path
        d="M8,10.3 Q9.6,9 11.2,10.6"
        fill="none"
        stroke="#4a1c14"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <path
        d="M16,10.3 Q14.4,9 12.8,10.6"
        fill="none"
        stroke="#4a1c14"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <circle cx="9.6" cy="13.4" r="1.05" fill="#2c0f0a" />
      <circle cx="14.4" cy="13.4" r="1.05" fill="#2c0f0a" />
      <path
        d="M8.1,16 Q12,19.6 15.9,16"
        fill="none"
        stroke="#4a1c14"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <polygon points="9.2,16.6 10.3,16.6 9.5,18.4" fill="#fbf3e4" />
      <polygon points="14.8,16.6 13.7,16.6 14.5,18.4" fill="#fbf3e4" />
      <polygon points="10.2,19.4 13.8,19.4 12,22" fill="#6e2a1f" />
    </svg>
  );
}
