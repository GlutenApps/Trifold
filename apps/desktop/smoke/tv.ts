import type { Page } from '@playwright/test';
import type { TrifoldBridge } from '@trifold/api';

/**
 * Chooses the primary display for the TV, as a DM with one screen does in Settings › Displays
 * (ADR 0046). On Automatic, Go live opens the TV only on a second display, and CI runners have
 * one, so specs that drive the TV window choose the primary first.
 */
export async function tvOnPrimary(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const trifold = (globalThis as unknown as { trifold: TrifoldBridge }).trifold;
    const displays = await trifold.displays.list();
    const primary = displays.find((d) => d.isPrimary) ?? displays[0];
    if (primary) await trifold.library.updateSettings({ playerDisplayId: primary.id });
  });
}
