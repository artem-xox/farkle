export interface FarkleNoticeProps {
  playerName: string;
  lost: number;
  secondsLeft: number;
  onContinue: () => void;
}

export function FarkleNotice({ playerName, lost, secondsLeft, onContinue }: FarkleNoticeProps) {
  /**
   * Same agreement problem `MatchOverOverlay`'s `winLine` solves, and the same
   * fix: the default name for the human seat is "You", so "You loses 250
   * unbanked points" was the *common* case rather than an edge one.
   */
  const isYou = /^you$/i.test(playerName.trim());

  return (
    <div className="farkle-notice">
      <p className="farkle-notice__title">Farkle — no scoring dice</p>
      <p className="farkle-notice__detail">
        {lost > 0 ? (
          <>
            {playerName} {isYou ? 'lose' : 'loses'} <strong>{lost}</strong> unbanked{' '}
            {lost === 1 ? 'point' : 'points'}.
          </>
        ) : (
          <>{playerName} had nothing at stake.</>
        )}
      </p>
      <button type="button" className="farkle-notice__button" onClick={onContinue} autoFocus>
        Continue <span className="farkle-notice__count">({secondsLeft}s)</span>
      </button>
    </div>
  );
}
