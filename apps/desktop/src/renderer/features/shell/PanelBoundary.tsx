import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * The safety net around each panel: a stage tab, a dock tool, a fly-out, a pop-up. An error
 * thrown while one of them draws used to unmount the whole window. Here it stops at the panel:
 * the panel says it stopped and offers to try again, the rest of the console keeps running
 * (the fight, the TV, the music), and what went wrong is written to the log.
 *
 * It catches errors in drawing only. A failed save or a rejected promise is the feature's own
 * to show as a banner, as before.
 */
interface Props {
  /** The panel's title, as the DM knows it. */
  name: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** How much of an error goes to the log: its message and where in the panel it was thrown. */
const DETAIL_MAX = 4000;

export class PanelBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    const detail = `${message}\n${info.componentStack ?? ''}`.slice(0, DETAIL_MAX);
    // Logging must never be what breaks the panel a second time.
    void Promise.resolve()
      .then(() => window.trifold.app.reportError(this.props.name, detail))
      .catch(() => undefined);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="banner error wraps panel-crash" role="alert" data-testid="panel-crash">
        <span>
          <strong>{this.props.name} hit a problem and stopped.</strong> The rest of Trifold is still
          running. <span className="panel-crash-detail">{error.message}</span>
        </span>
        <span className="row">
          <button
            type="button"
            className="btn small"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
          <button
            type="button"
            className="btn small"
            onClick={() => void window.trifold.app.openLogsFolder()}
          >
            Open logs folder
          </button>
        </span>
      </div>
    );
  }
}
