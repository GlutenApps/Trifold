import { describe, expect, it } from 'vitest';
import { systemPageUrl } from './systemPages';

describe('systemPageUrl', () => {
  it('points Windows at Bluetooth settings and the Store, never AirPlay', () => {
    expect(systemPageUrl('bluetooth', 'win32')).toBe('ms-settings:bluetooth');
    expect(systemPageUrl('bluetoothReceiverStore', 'win32')).toMatch(/^ms-windows-store:/);
    expect(systemPageUrl('sound', 'win32')).toBe('ms-settings:sound');
    expect(systemPageUrl('airplay', 'win32')).toBeNull();
  });

  it('points macOS at the AirDrop & Handoff pane for AirPlay Receiver, never the Store', () => {
    expect(systemPageUrl('airplay', 'darwin')).toBe(
      'x-apple.systempreferences:com.apple.AirDrop-Handoff-Settings.extension',
    );
    expect(systemPageUrl('bluetooth', 'darwin')).toMatch(/^x-apple\.systempreferences:/);
    expect(systemPageUrl('bluetoothReceiverStore', 'darwin')).toBeNull();
  });

  it('has nothing for other platforms', () => {
    expect(systemPageUrl('sound', 'linux')).toBeNull();
  });
});
