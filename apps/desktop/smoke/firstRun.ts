import type { Page } from '@playwright/test';

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
