import { expect, type Page } from '@playwright/test';

/**
 * Answers the first-run choice (ADR 0077) as a game master: a new Library asks first, and only a
 * game master's gets the sample campaign the GM smoke tests play with.
 */
export async function chooseGameMaster(page: Page): Promise<void> {
  await page
    .getByTestId('first-run')
    .getByRole('button', { name: /^Game master/ })
    .click();
}

/**
 * After a restart: Trifold starts on Library › Campaigns (ADR 0079), with no campaign open, so a
 * spec that checks what a campaign kept opens it from its card first.
 */
export async function reopenCampaign(page: Page, name: string): Promise<void> {
  await expect(page.getByRole('button', { name: 'Create campaign' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Campaign', exact: true })).toHaveCount(0);
  await page
    .locator('.campaign-card')
    .filter({ hasText: name })
    .getByRole('button', { name: 'Open', exact: true })
    .click();
  await expect(page.getByRole('tab', { name: 'Campaign', exact: true })).toBeVisible();
}
