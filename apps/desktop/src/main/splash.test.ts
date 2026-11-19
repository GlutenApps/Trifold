import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ BrowserWindow: class {} }));
vi.mock('./splash.html?raw', () => ({ default: '<!doctype html>' }));
vi.mock('./windows', () => ({ WINDOW_BG: '#14181d' }));

import { Splash, type SplashWindow } from './splash';

function harness() {
  let pending: (() => void) | null = null;
  const timers = {
    set: vi.fn((fn: () => void) => {
      pending = fn;
      return 1;
    }),
    clear: vi.fn(() => {
      pending = null;
    }),
  };
  const win: SplashWindow & { calls: string[] } = {
    calls: [],
    show() {
      this.calls.push('show');
    },
    setStatus(text) {
      this.calls.push(`status:${text}`);
    },
    close() {
      this.calls.push('close');
    },
  };
  const create = vi.fn(() => win);
  const splash = new Splash(create, 250, timers);
  const fire = () => {
    const fn = pending;
    pending = null;
    fn?.();
  };
  return { splash, create, win, timers, fire };
}

describe('Splash', () => {
  it('never opens when startup finishes before the delay', () => {
    const h = harness();
    h.splash.start();
    h.splash.done();
    h.fire();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.timers.clear).toHaveBeenCalled();
  });

  it('opens after the delay with the latest status, then closes when done', () => {
    const h = harness();
    h.splash.start();
    h.splash.setStatus('Opening your Library…');
    h.fire();
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.win.calls).toEqual(['status:Opening your Library…', 'show']);
    h.splash.setStatus('Loading the console…');
    h.splash.done();
    h.splash.done();
    expect(h.win.calls).toEqual([
      'status:Opening your Library…',
      'show',
      'status:Loading the console…',
      'close',
    ]);
  });

  it('starts once and ignores start after done', () => {
    const h = harness();
    h.splash.start();
    h.splash.start();
    expect(h.timers.set).toHaveBeenCalledTimes(1);
    h.splash.done();
    h.splash.start();
    expect(h.timers.set).toHaveBeenCalledTimes(1);
  });
});
