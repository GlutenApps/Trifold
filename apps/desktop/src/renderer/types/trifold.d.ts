import type { TrifoldBridge } from '@trifold/api';

declare global {
  interface Window {
    /** Exposed by the preload script; the only way the renderer reaches the main process. */
    trifold: TrifoldBridge;
  }
}

export {};
