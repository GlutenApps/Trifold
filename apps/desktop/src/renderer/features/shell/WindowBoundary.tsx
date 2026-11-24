import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * The safety net around a whole window (ADR 0079), outside every `PanelBoundary`. An error thrown
 * while the shell itself draws (the top bar, the Library, the dock) used to leave a blank page:
 * at launch that page never painted, so the splash stayed up and the console never showed. Here
 * the window says it stopped, offers to reload, and the error goes to the log.
 *
 * `quiet` is for the TV: the players see a blank screen, never an error, and the log still has it.
 */
interface Props {
  /** Which window, for the log. */
  name: string;
  quiet?: boolean;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const DETAIL_MAX = 4000;

export class WindowBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    const detail = `${message}\n${info.componentStack ?? ''}`.slice(0, DETAIL_MAX);
    void Promise.resolve()
      .then(() => window.trifold.app.reportError(this.props.name, detail))
      .catch(() => undefined);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <div className="window-crash">
        <div className="banner error wraps" role="alert" data-testid="window-crash">
          <span>
            <strong>Trifold hit a problem and stopped drawing this window.</strong>{' '}
            <span className="panel-crash-detail">{error.message}</span>
          </span>
          <span className="row">
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void window.trifold.app.openLogsFolder()}
            >
              Open logs folder
            </button>
          </span>
        </div>
      </div>
    );
  }
}
