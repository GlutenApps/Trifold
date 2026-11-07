import { describe, expect, it } from 'vitest';
import { forwardableInput, planWindowOpen, webTabUserAgent } from './webTabs';

describe('webTabUserAgent', () => {
  it('is a Firefox string for the platform with no Electron, app or Chrome token', () => {
    const win = webTabUserAgent('win32');
    expect(win).toMatch(
      /^Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64; rv:[\d.]+\) Gecko\/\d+ Firefox\/[\d.]+$/,
    );
    expect(webTabUserAgent('darwin')).toContain('Macintosh');
    for (const ua of [win, webTabUserAgent('darwin'), webTabUserAgent('linux')]) {
      expect(ua).not.toMatch(/electron|trifold|chrome/i);
    }
  });
});

describe('planWindowOpen', () => {
  it('keeps scripted pop-ups in the app, even before they have an address', () => {
    expect(planWindowOpen('https://example.com/auth', 'new-window')).toBe('popup');
    expect(planWindowOpen('about:blank', 'new-window')).toBe('popup');
    expect(planWindowOpen('', 'new-window')).toBe('popup');
    expect(planWindowOpen('file:///C:/x', 'new-window')).toBe('deny');
  });

  it('sends links that want a new tab to the system browser', () => {
    expect(planWindowOpen('https://example.com/page', 'foreground-tab')).toBe('external');
    expect(planWindowOpen('https://example.com/page', 'background-tab')).toBe('external');
    expect(planWindowOpen('javascript:alert(1)', 'foreground-tab')).toBe('deny');
  });
});

describe('forwardableInput', () => {
  const press = (over: Partial<Parameters<typeof forwardableInput>[0]>) =>
    forwardableInput({
      type: 'keyDown',
      key: 'k',
      control: false,
      alt: false,
      shift: false,
      meta: false,
      ...over,
    });

  it('echoes modifier combos on key-down only', () => {
    expect(press({ control: true })).toEqual({
      key: 'k',
      control: true,
      alt: false,
      shift: false,
      meta: false,
    });
    expect(press({ control: true, type: 'keyUp' })).toBeNull();
  });

  it('keeps plain and shift-only keys with the page', () => {
    expect(press({})).toBeNull();
    expect(press({ shift: true })).toBeNull();
  });
});
