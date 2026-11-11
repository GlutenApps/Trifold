import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test, type Locator, type Page } from '@playwright/test';
import { keepLogs } from './keepLogs';

/**
 * The tray (ADR 0023) inside real Electron: choose a timer and a counter for it in place of
 * Music, use them from the tray, check that four sections and Dice fit a window narrower than the
 * CI runners' screens, and find the same tray after a restart.
 */

// Page-side callbacks in `evaluate` run in the renderer; this spec reads only the window's width.
declare const window: { innerWidth: number };

const { ELECTRON_RUN_AS_NODE: _dropped, ...env } = process.env;
const exe = process.env['TRIFOLD_SMOKE_EXE'];

function launch(userData: string, library: string) {
  return electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: [resolve(__dirname, '..')] }),
    env: { ...env, TRIFOLD_USER_DATA: userData, TRIFOLD_LIBRARY: library },
  });
}

/** Opens a dock tool, retrying while the campaign's saved layout settles (see counters.spec). */
async function openTool(page: Page, tool: string, marker: Locator) {
  const button = page
    .getByTestId('dock')
    .getByRole('button', { name: `${tool} tool`, exact: true });
  await expect(async () => {
    if (!(await marker.isVisible())) await button.click();
    await expect(marker).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/** The strip's sections in order, by their data-strip names. */
const sections = (page: Page) =>
  page
    .getByTestId('live-strip')
    .locator('[data-strip]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-strip')));

test('the tray takes a timer and a counter, fits a narrow window and comes back after a restart', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'trifold-userdata-'));
  const library = await mkdtemp(join(tmpdir(), 'trifold-library-'));
  let app = await launch(userData, library);

  try {
    let page = await app.firstWindow();
    const rendererErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') rendererErrors.push(msg.text());
    });
    await page
      .getByRole('navigation', { name: 'Library' })
      .getByRole('button', { name: 'Campaigns', exact: true })
      .click();
    await page.getByLabel('New campaign name').fill('Tray Campaign');
    await page.getByRole('button', { name: 'Create campaign' }).click();
    await expect(page.getByRole('tab', { name: 'Campaign', exact: true })).toBeVisible();

    // A timer and a counter to put on the tray.
    await openTool(page, 'Timers', page.getByRole('button', { name: 'New timer', exact: true }));
    await page.getByRole('button', { name: 'New timer', exact: true }).click();
    const timerForm = page.getByRole('form', { name: 'Create timer' });
    await timerForm.getByLabel('Name', { exact: true }).fill('Guards return');
    await timerForm.getByLabel('Duration', { exact: true }).fill('5m');
    await timerForm.getByRole('button', { name: 'Create timer' }).click();
    await expect(page.getByRole('listitem', { name: 'Guards return' })).toBeVisible();

    await openTool(
      page,
      'Counters',
      page.getByRole('button', { name: 'New counter', exact: true }),
    );
    await page.getByRole('button', { name: 'New counter', exact: true }).click();
    const counterForm = page.getByRole('form', { name: 'Create counter' });
    await counterForm.getByLabel('Name').fill('Legendary resistance');
    await counterForm.getByLabel('Initial').fill('3');
    await counterForm.getByRole('button', { name: 'Create counter' }).click();
    await expect(page.getByRole('listitem', { name: 'Legendary resistance' })).toBeVisible();

    const strip = page.getByTestId('live-strip');
    expect(await sections(page)).toEqual(['tv', 'music', 'combat', 'choose', 'dice']);

    // Choose: the timer fills the fourth place, so the counter waits until Music comes off.
    await strip.getByRole('button', { name: 'Choose what the tray shows' }).click();
    const chooser = page.getByRole('dialog', { name: 'Tray' });
    await chooser.getByRole('checkbox', { name: 'Guards return' }).check();
    await expect(chooser.getByTestId('tray-count')).toContainText('4 of 4');
    await expect(chooser.getByRole('checkbox', { name: 'Legendary resistance' })).toBeDisabled();
    await chooser.getByRole('checkbox', { name: 'Music' }).uncheck();
    await chooser.getByRole('checkbox', { name: 'Legendary resistance' }).check();
    await page.keyboard.press('Escape');
    await expect(chooser).toBeHidden();
    expect(await sections(page)).toEqual(['tv', 'combat', 'counter', 'timer', 'choose', 'dice']);

    // Use them from the tray.
    await strip.getByRole('button', { name: 'Start Guards return (tray)' }).click();
    await expect(strip.getByRole('button', { name: 'Pause Guards return (tray)' })).toBeVisible();
    await strip.getByRole('button', { name: 'Take 1 from Legendary resistance (tray)' }).click();
    await expect(strip.locator('[data-strip="counter"] .tray-value')).toHaveText('2');
    await expect(
      page
        .getByRole('listitem', { name: 'Legendary resistance' })
        .getByRole('button', { name: /^Legendary resistance: 2/ }),
    ).toBeVisible();

    // A window narrower than the CI screens still shows all four and Dice, inside the window.
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      if (win.isMaximized()) win.unmaximize();
      win.setSize(1100, 760);
    });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(1100);
    const width = await page.evaluate(() => window.innerWidth);
    const boxes = strip.locator('[data-strip]');
    const overflow: string[] = [];
    for (let i = 0; i < (await boxes.count()); i++) {
      const box = await boxes.nth(i).boundingBox();
      if (!box || box.x + box.width > width + 0.5) {
        overflow.push((await boxes.nth(i).getAttribute('data-strip')) ?? '?');
      }
    }
    expect(overflow).toEqual([]);
    await expect(strip.getByRole('button', { name: 'Dice', exact: true })).toBeVisible();

    expect(rendererErrors).toEqual([]);
    await app.close();

    // The tray is part of the campaign's console and comes back as it was.
    app = await launch(userData, library);
    page = await app.firstWindow();
    await expect(page.getByRole('tab', { name: 'Campaign', exact: true })).toBeVisible();
    await expect
      .poll(() => sections(page))
      .toEqual(['tv', 'combat', 'counter', 'timer', 'choose', 'dice']);
  } catch (err) {
    await keepLogs({ library, userData });
    throw err;
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
    await rm(library, { recursive: true, force: true });
  }
});
