import type { TrifoldBridge } from '@trifold/api';

/**
 * Types `window.trifold`, the bridge the preload script exposes (CLAUDE.md repo layout). The
 * renderer never imports `electron`, `fs` or SQLite; everything it asks of the main process goes
 * through this one typed interface from `packages/api`, so a change there is a type error on
 * both sides.
 */

declare global {
  interface Window {
    /** Exposed by the preload script; the only way the renderer reaches the main process. */
    trifold: TrifoldBridge;
  }
}

export {};
