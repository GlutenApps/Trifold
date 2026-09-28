import { afterEach, describe, expect, it, vi } from 'vitest';
import { comboFromEvent, installHotkeys, listHotkeys, registerHotkey } from './hotkeys';

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach((off) => off());
});

describe('comboFromEvent', () => {
  it('orders modifiers and upper-cases single keys', () => {
    expect(
      comboFromEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, shiftKey: true })),
    ).toBe('Ctrl+Shift+B');
    expect(comboFromEvent(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe('Escape');
    expect(comboFromEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }))).toBe(
      'Shift',
    );
  });
});

describe('registry', () => {
  it('runs a registered hotkey and unregisters cleanly', () => {
    const run = vi.fn();
    cleanups.push(installHotkeys());
    const off = registerHotkey({ id: 'test', combo: 'Ctrl+Shift+B', description: 'test', run });
    expect(listHotkeys().map((h) => h.id)).toContain('test');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, shiftKey: true }));
    expect(run).toHaveBeenCalledTimes(1);

    off();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, shiftKey: true }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('ignores plain keys while typing but lets Ctrl combos through', () => {
    const plain = vi.fn();
    const combo = vi.fn();
    cleanups.push(installHotkeys());
    cleanups.push(registerHotkey({ id: 'plain', combo: 'N', description: 'next', run: plain }));
    cleanups.push(
      registerHotkey({ id: 'combo', combo: 'Ctrl+K', description: 'search', run: combo }),
    );

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    input.remove();

    expect(plain).not.toHaveBeenCalled();
    expect(combo).toHaveBeenCalledTimes(1);
  });
});
