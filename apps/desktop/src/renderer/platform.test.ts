import { describe, expect, it, vi } from 'vitest';

async function loadWith(platform: string) {
  vi.resetModules();
  vi.stubGlobal('navigator', { platform });
  try {
    return await import('./platform');
  } finally {
    vi.unstubAllGlobals();
  }
}

describe('hk', () => {
  it('writes arrows and the Windows key out on Windows', async () => {
    const { hk, isMac } = await loadWith('Win32');
    expect(isMac).toBe(false);
    expect(hk('Ctrl+Alt+ArrowRight')).toBe('Ctrl+Alt+Right');
    expect(hk('Ctrl+,')).toBe('Ctrl+,');
  });

  it('uses the Mac glyphs with Command for Ctrl on macOS', async () => {
    const { hk, isMac } = await loadWith('MacIntel');
    expect(isMac).toBe(true);
    expect(hk('Ctrl+Alt+ArrowRight')).toBe('⌘⌥→');
    expect(hk('Ctrl+Shift+B')).toBe('⌘⇧B');
    expect(hk('Ctrl+Enter')).toBe('⌘↩');
  });

  it('marks the document with the platform', async () => {
    const { applyPlatformClass } = await loadWith('MacIntel');
    const doc = document.implementation.createHTMLDocument('');
    applyPlatformClass(doc);
    expect(doc.documentElement.dataset['platform']).toBe('mac');
  });
});
