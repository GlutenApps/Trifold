/**
 * Writes errors nothing caught (a throw in an event handler, a rejected promise nobody awaited)
 * to the app's log through `app.reportError` (ADR 0079). Errors while drawing are the boundaries'
 * (`PanelBoundary`, `WindowBoundary`); these are the rest, which otherwise vanish in a packaged
 * build. At most `max` per page load, so a fault that repeats cannot flood the log.
 */
export const UNCAUGHT_MAX = 10;

type Report = (where: string, detail: string) => Promise<void>;

function describe(reason: unknown): string {
  if (reason instanceof Error) return reason.stack ?? reason.message;
  return String(reason);
}

export function reportUncaught(
  target: Pick<Window, 'addEventListener'>,
  report: Report,
  max = UNCAUGHT_MAX,
): void {
  let sent = 0;
  const send = (where: string, detail: string) => {
    if (sent >= max) return;
    sent += 1;
    // Logging must never be what throws next.
    void Promise.resolve()
      .then(() => report(where, detail.slice(0, 4000)))
      .catch(() => undefined);
  };
  target.addEventListener('error', (event) => {
    const e = event as ErrorEvent;
    send('uncaught error', e.error !== undefined ? describe(e.error) : e.message);
  });
  target.addEventListener('unhandledrejection', (event) => {
    send('unhandled rejection', describe((event as PromiseRejectionEvent).reason));
  });
}
