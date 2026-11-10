import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test, type Locator, type Page } from '@playwright/test';
import { keepLogs } from './keepLogs';

/**
 * Timers (ADR 0021) inside real Electron: two timers run at once, one is on the TV and the
 * player window counts it down and alerts at zero on its own clock, and after a restart the
 * definitions are back with every run reset.
 */

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

const openTimers = (page: Page) =>
  openTool(page, 'Timers', page.getByRole('button', { name: 'New timer', exact: true }));

async function newTimer(page: Page, name: string, duration: string) {
  await page.getByRole('button', { name: 'New timer', exact: true }).click();
  const form = page.getByRole('form', { name: 'Create timer' });
  await form.getByLabel('Name', { exact: true }).fill(name);
  await form.getByLabel('Duration', { exact: true }).fill(duration);
  await form.getByRole('button', { name: 'Create timer' }).click();
  await expect(page.getByRole('listitem', { name })).toBeVisible();
}

test('timers run side by side, count down on the TV, and come back idle after a restart', async () => {
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
    await page.getByLabel('New campaign name').fill('Timer Campaign');
    await page.getByRole('button', { name: 'Create campaign' }).click();
    await expect(page.getByRole('tab', { name: 'Campaign', exact: true })).toBeVisible();

    await openTimers(page);
    await newTimer(page, 'Decide', '3');
    await newTimer(page, 'Guards return', '1m');

    // The TV: open it and lift the blackout with a title card from Scenes.
    const playerPromise = app.waitForEvent('window');
    await page.getByTestId('live-strip').getByRole('button', { name: 'Open TV (tray)' }).click();
    const player = await playerPromise;
    await openTool(page, 'Scenes', page.getByLabel('New scene title'));
    await page.getByLabel('New scene title').fill('The bridge');
    await page.getByRole('button', { name: 'New title card' }).click();
    await page.getByTestId('scene-row').press('Enter');
    await expect(player.getByRole('heading', { name: 'The bridge' })).toBeVisible();

    await openTimers(page);
    const decide = page.getByRole('listitem', { name: 'Decide' });
    const guards = page.getByRole('listitem', { name: 'Guards return' });
    await decide.getByRole('button', { name: 'Show Decide on the TV' }).click();
    const onTv = player.getByTestId('tv-timer');
    await expect(onTv).toContainText('Decide');
    await expect(onTv).toContainText('0:03');

    // Both run at once.
    await guards.getByRole('button', { name: 'Start Guards return' }).click();
    await decide.getByRole('button', { name: 'Start Decide' }).click();
    await expect(guards).toHaveClass(/status-running/);
    await expect(decide).toHaveClass(/status-done/, { timeout: 6_000 });
    await expect(decide.getByRole('status')).toHaveText('Time’s up');
    await expect(onTv).toHaveClass(/status-done/);
    await expect(onTv).toContainText('0:00');
    // The other timer kept its own time: a few seconds in, not reset by the first one ending.
    await expect(guards.getByTestId('timer-clock')).toHaveText(/^0:5\d$/);
    await expect(guards).toHaveClass(/status-running/);

    expect(rendererErrors).toEqual([]);
    await app.close();

    // Only the definitions are on disk.
    const dir = join(library, 'campaigns', 'timer-campaign', 'timers');
    const onDisk = await Promise.all(
      (await readdir(dir))
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => JSON.parse(await readFile(join(dir, f), 'utf8'))),
    );
    expect(
      onDisk
        .sort((a, b) => a.order - b.order)
        .map((t) => [t.name, t.durationSec, t.chime, !!t.showOnTv]),
    ).toEqual([
      ['Decide', 3, true, true],
      ['Guards return', 60, true, false],
    ]);
    expect(JSON.stringify(onDisk)).not.toMatch(/endsAt|status|leftMs/);

    // After a restart every timer is idle at its full time.
    app = await launch(userData, library);
    page = await app.firstWindow();
    await expect(page.getByRole('tab', { name: 'Campaign', exact: true })).toBeVisible();
    await openTimers(page);
    const back = page.getByRole('listitem', { name: 'Guards return' });
    await expect(back).toHaveClass(/status-idle/);
    await expect(back.getByTestId('timer-clock')).toHaveText('1:00');
    await expect(
      page.getByRole('listitem', { name: 'Decide' }).getByTestId('timer-clock'),
    ).toHaveText('0:03');
  } catch (err) {
    await keepLogs({ library, userData });
    throw err;
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
    await rm(library, { recursive: true, force: true });
  }
});
