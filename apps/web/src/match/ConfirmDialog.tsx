import { useEffect, useRef } from 'react';

export interface ConfirmDialogProps {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * A guard in front of the two actions that throw a match away.
 *
 * Focus lands on Cancel rather than on the confirming button: this only ever
 * appears in front of something destructive, so the keyboard default should be
 * the harmless one. Escape and a click on the backdrop both cancel, for the
 * same reason.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onCancel();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="confirm"
      // A backdrop click cancels, but only when the backdrop itself was hit —
      // without the target check, a drag that ends outside the card would too.
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="confirm__card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 className="confirm__title" id="confirm-title">
          {title}
        </h2>
        <p className="confirm__message">{message}</p>
        <div className="confirm__actions">
          <button type="button" className="confirm__cancel" ref={cancelRef} onClick={onCancel}>
            Keep playing
          </button>
          <button type="button" className="confirm__confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
