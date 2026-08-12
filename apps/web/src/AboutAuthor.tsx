import { useEffect, useRef, useState } from 'react';

const GITHUB_URL = 'https://github.com/artem-xox';
const LINKEDIN_URL = 'https://www.linkedin.com/in/iamxox/';
const BTC_ADDRESS = 'bc1qvftsqrn3pmju7zs5y2x8vtvnmd2kgh0hezzczn';

/**
 * Small footer credit plus the popup behind it.
 *
 * Same modal idiom as `ConfirmDialog`: a card over a dimmed backdrop, focus
 * moved onto the close button on open, Escape and a backdrop click both
 * dismiss it.
 */
export function AboutAuthor() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const id = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function copyAddress(): Promise<void> {
    try {
      await navigator.clipboard.writeText(BTC_ADDRESS);
      setCopied(true);
    } catch {
      // Clipboard API can be unavailable (insecure context, older Safari) — no fallback worth the complexity.
    }
  }

  return (
    <>
      <button type="button" className="about-author__trigger" onClick={() => setOpen(true)}>
        Made by Artem
      </button>

      {open && (
        <div
          className="about-author"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <div
            className="about-author__card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-author-title"
          >
            <button
              type="button"
              className="about-author__close"
              ref={closeRef}
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>

            <h2 className="about-author__title" id="about-author-title">
              Why this game exists
            </h2>

            <p className="about-author__story">
              Hi, I am Artem. I played Kingdom Come: Deliverance 2 and fell head over heels for it —
              especially the dice game played over camp fires and tavern tables. I liked it enough that I
              sat down and built my own version of it, right down here.
            </p>

            <div className="about-author__links">
              <a
                className="about-author__link"
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
              >
                <GithubIcon />
                <span>GitHub</span>
              </a>
              <a
                className="about-author__link"
                href={LINKEDIN_URL}
                target="_blank"
                rel="noreferrer noopener"
              >
                <LinkedInIcon />
                <span>LinkedIn</span>
              </a>
            </div>

            <div className="about-author__btc">
              <span className="about-author__btc-label">
                Enjoyed it? Toss a bitcoin to your developer:
              </span>
              <div className="about-author__btc-row">
                <code className="about-author__btc-address">{BTC_ADDRESS}</code>
                <button type="button" className="about-author__copy" onClick={copyAddress}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M14.82 0H1.18C.53 0 0 .52 0 1.16v13.68C0 15.48.53 16 1.18 16h13.64c.65 0 1.18-.52 1.18-1.16V1.16C16 .52 15.47 0 14.82 0ZM4.75 13.4H2.4V6h2.35v7.4ZM3.58 4.98c-.75 0-1.36-.61-1.36-1.36 0-.75.61-1.35 1.36-1.35.75 0 1.36.6 1.36 1.35 0 .75-.61 1.36-1.36 1.36ZM13.6 13.4h-2.35V9.8c0-.86-.02-1.96-1.2-1.96-1.2 0-1.39.94-1.39 1.9v3.66H6.32V6h2.26v1.01h.03c.31-.6 1.08-1.23 2.23-1.23 2.39 0 2.83 1.57 2.83 3.61v3.99Z" />
    </svg>
  );
}
