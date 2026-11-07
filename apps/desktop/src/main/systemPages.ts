import type { SystemPage } from '@trifold/api';

/**
 * Deep links into the OS settings the "Phone audio" guide points at (ADR 0007). The OS, not
 * Trifold, receives a phone's audio: Windows 11 through its Bluetooth A2DP sink (Microsoft's
 * free "Bluetooth Audio Receiver" Store app), macOS through AirPlay Receiver. Null when the
 * platform has no such page.
 */
export function systemPageUrl(page: SystemPage, platform: NodeJS.Platform): string | null {
  if (platform === 'win32') {
    switch (page) {
      case 'bluetooth':
        return 'ms-settings:bluetooth';
      case 'bluetoothReceiverStore':
        return 'ms-windows-store://search/?query=Bluetooth%20Audio%20Receiver';
      case 'sound':
        return 'ms-settings:sound';
      case 'airplay':
        return null;
    }
  }
  if (platform === 'darwin') {
    switch (page) {
      case 'bluetooth':
        return 'x-apple.systempreferences:com.apple.BluetoothSettings';
      case 'airplay':
        return 'x-apple.systempreferences:com.apple.AirDrop-Handoff-Settings.extension';
      case 'sound':
        return 'x-apple.systempreferences:com.apple.Sound-Settings.extension';
      case 'bluetoothReceiverStore':
        return null;
    }
  }
  return null;
}
