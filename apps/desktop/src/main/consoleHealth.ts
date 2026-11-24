/**
 * What Trifold does when the console's page fails (ADR 0079): the pure decisions, so they can be
 * tested without Electron. `WindowManager` reports the trouble and `index.ts` acts on it. The
 * page's colours are the dark theme's --bg, --text and --text-muted (renderer/styles/global.css).
 */

/** How long startup waits for the console's first paint before showing the window anyway. */
export const CONSOLE_READY_LIMIT_MS = 30_000;

/** A console page that stops again within this long of an automatic reload is not reloaded. */
export const RELOAD_COOLDOWN_MS = 60_000;

/** At most this many of the console's own error lines go to the log before it first shows. */
export const STARTUP_ERROR_LINES = 20;

/** Something the console window reported. */
export type ConsoleTrouble =
  /** The page's process stopped (crashed, killed, out of memory). */
  | { kind: 'gone'; reason: string; exitCode: number }
  /** The page itself could not be loaded. */
  | { kind: 'load-failed'; code: number; description: string }
  /** The page stopped answering, or answered again. */
  | { kind: 'unresponsive' }
  | { kind: 'responsive' }
  /** The page has not painted `CONSOLE_READY_LIMIT_MS` after the window was made. */
  | { kind: 'slow' }
  /** The page wrote an error to its console before it first showed. */
  | { kind: 'error'; message: string };

/** The log line for a trouble report. */
export function describeTrouble(t: ConsoleTrouble): string {
  switch (t.kind) {
    case 'gone':
      return `console page stopped (${t.reason}, exit code ${t.exitCode})`;
    case 'load-failed':
      return `console page failed to load: ${t.description} (${t.code})`;
    case 'unresponsive':
      return 'console page is not responding';
    case 'responsive':
      return 'console page is responding again';
    case 'slow':
      return `console page did not paint within ${CONSOLE_READY_LIMIT_MS / 1000} s; showing the window anyway`;
    case 'error':
      return `console page error: ${t.message.slice(0, 2000)}`;
  }
}

/**
 * A page that stopped is reloaded once; if it stops again within the cooldown, the reload is
 * not repeated and the window explains instead, so a page that fails on every load cannot loop.
 */
export function afterPageGone(lastReloadAt: number | null, now: number): 'reload' | 'explain' {
  return lastReloadAt !== null && now - lastReloadAt < RELOAD_COOLDOWN_MS ? 'explain' : 'reload';
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The page the console shows when its own page cannot run: what happened, what to do, and where
 * the log is. Self-contained (no scripts, fonts or network), on the window's slate, with room at
 * the top for the window controls the OS draws over the title bar.
 */
export function problemPage(what: string, logDir: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Trifold</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
  html, body { margin: 0; height: 100%; background: #14181d; color: #e6e1d6;
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  body { -webkit-app-region: drag; display: flex; align-items: center; justify-content: center; }
  main { -webkit-app-region: no-drag; max-width: 560px; padding: 64px 24px 24px; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 12px; }
  p { margin: 0 0 12px; color: #9aa3ad; }
  code { user-select: all; color: #e6e1d6; word-break: break-all; }
</style></head>
<body><main>
  <h1>Trifold's window stopped working</h1>
  <p>${escapeHtml(what)}</p>
  <p>Close Trifold and open it again. If this keeps happening, the log says what went wrong. It is in:</p>
  <p><code>${escapeHtml(logDir)}</code></p>
</main></body></html>`;
}
