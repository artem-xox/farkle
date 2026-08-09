export interface FarkleNoticeProps {
  playerName: string;
  lost: number;
  secondsLeft: number;
  onContinue: () => void;
}

export function FarkleNotice({ playerName, lost, secondsLeft, onContinue }: FarkleNoticeProps) {
  return (
    <div className="farkle-notice">
      <p className="farkle-notice__title">Farkle — no scoring dice</p>
      <p className="farkle-notice__detail">
        {lost > 0 ? (
          <>
            {playerName} loses <strong>{lost}</strong> unbanked {lost === 1 ? 'point' : 'points'}.
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
