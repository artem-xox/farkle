import { Component, type ErrorInfo, type ReactNode } from 'react';

import { clearMatch } from './storage';

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

/**
 * Without this, anything the engine or a component throws during render
 * unmounts the whole tree and leaves a blank page — indistinguishable from a
 * failed deploy, and with no way for the player to get out of it. There is no
 * error reporting service wired up (PLAN.md M4), so the console is the only
 * record; the point here is that the player sees the failure, keeps the
 * detail they'd need to report it, and has an escape hatch when a saved match
 * is what's poisoning the render.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Farkle crashed:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }

    return (
      <div className="crash">
        <div className="crash__card">
          <h2>The game hit an error</h2>
          <p>
            Something in the game threw and the screen could not be drawn. Reloading usually fixes
            it; if it happens again straight away, a saved match may be the cause.
          </p>
          <pre className="crash__detail">{error.message}</pre>
          <div className="crash__actions">
            <button type="button" className="crash__button" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button
              type="button"
              className="crash__link"
              onClick={() => {
                clearMatch();
                window.location.reload();
              }}
            >
              Discard the saved match and reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
