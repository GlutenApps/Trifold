import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test, type Locator, type Page } from '@playwright/test';
import { keepLogs } from './keepLogs';

/**
 * Counters (ADR 0019) inside real Electron: make two counters in the dock tool, change them,
 * hit a bound, put one on the TV, quit, and find the same values after a restart on the same
 * Library.
 */

const { ELECTRON_RUN_AS_NODE: _dropped, ...env } = process.env;
const exe = process.env['TRIFOLD_SMOKE_EXE'];

function launch(userData: string, library: string) {
  return electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: [resolve(__dirname, '..')] }),
    env: { ...env, TRIFOLD_USER_DATA: userData, TRIFOLD_LIBRARY: library },
  });
}

/**
 * Opens a dock tool: a section in a wide dock, a flyout on a narrow (CI) screen. Just after a
 * campaign opens, its saved layout can still replace the one a first click changed, so the click
 * is repeated until `marker` (something inside the tool) is on screen.
 */
async function openTool(page: Page, tool: string, marker: Locator) {
  const button = page
    .getByTestId('dock')
    .getByRole('button', { name: `${tool} tool`, exact: true });
  await expect(async () => {
    if (!(await marker.isVisible())) await button.click();
    await expect(marker).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

const openCounters = (page: Page) =>
  openTool(page, 'Counters', page.getByRole('button', { name: 'New counter', exact: true }));

async function newCounter(page: Page, name: string, fields: Record<string, string>) {
  await page.getByRole('button', { name: 'New counter', exact: true }).click();
  const form = page.getByRole('form', { name: 'Create counter' });
  await form.getByLabel('Name').fill(name);
  for (const [label, value] of Object.entries(fields)) await form.getByLabel(label).fill(value);
  await form.getByRole('button', { name: 'Create counter' }).click();
  await expect(page.getByRole('listitem', { name })).toBeVisible();
}

test('counters are made, changed, held at their bounds, shown on the TV and kept through a restart', async () => {
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
    await page.getByLabel('New campaign name').fill('Counter Campaign');
    await page.getByRole('button', { name: 'Create campaign' }).click();
    await expect(page.getByRole('tab', { name: 'Campaign', exact: true })).toBeVisible();

    await openCounters(page);
    await newCounter(page, 'Ritual rounds', { Initial: '5', Minimum: '0', Maximum: '5' });
    await newCounter(page, 'Torches', { Initial: '2', 'Alternate step': '5' });

    const ritual = page.getByRole('listitem', { name: 'Ritual rounds' });
    // At its maximum from the start: one more is held there and marked.
    await ritual.getByRole('button', { name: 'Add 1 to Ritual rounds' }).click();
    await expect(ritual).toHaveClass(/at-max/);
    await ritual.getByRole('button', { name: 'Take 1 from Ritual rounds' }).click();
    await ritual.getByRole('button', { name: 'Take 1 from Ritual rounds' }).click();
    await expect(ritual.getByRole('button', { name: /^Ritual rounds: 3/ })).toBeVisible();

    const torches = page.getByRole('listitem', { name: 'Torches' });
    await torches.getByRole('button', { name: 'Add 5 to Torches' }).click();
    // The arrow keys change a focused counter.
    await torches.getByRole('button', { name: /^Torches: 7/ }).focus();
    await page.keyboard.press('ArrowUp');
    await expect(torches.getByRole('button', { name: /^Torches: 8/ })).toBeVisible();

    // The TV: open it, lift the blackout with a title card from Scenes, then put a counter on.
    const playerPromise = app.waitForEvent('window');
    await page.getByTestId('live-strip').getByRole('button', { name: 'Open TV (tray)' }).click();
    const player = await playerPromise;
    await expect(player.getByTestId('player-blackout')).toBeVisible();
    await openTool(page, 'Scenes', page.getByLabel('New scene title'));
    await page.getByLabel('New scene title').fill('Ritual chamber');
    await page.getByRole('button', { name: 'New title card' }).click();
    await page.getByTestId('scene-row').press('Enter');
    await expect(player.getByRole('heading', { name: 'Ritual chamber' })).toBeVisible();
    await openCounters(page);
    await ritual.getByRole('button', { name: 'Show Ritual rounds on the TV' }).click();
    const onTv = player.getByTestId('tv-counters');
    await expect(onTv).toContainText('Ritual rounds');
    await expect(onTv).toContainText('3 / 5');
    await ritual.getByRole('button', { name: 'Take 1 from Ritual rounds' }).click();
    await expect(onTv).toContainText('2 / 5');

    expect(rendererErrors).toEqual([]);
    // Quitting writes the values still waiting for the DM to stop clicking.
    await app.close();

    const dir = join(library, 'campaigns', 'counter-campaign', 'counters');
    const onDisk = await Promise.all(
      (await readdir(dir)).map(async (f) => JSON.parse(await readFile(join(dir, f), 'utf8'))),
    );
    expect(
      onDisk
        .sort((a, b) => a.order - b.order)
        .map((c) => [
          c.name,
          c.value,
          c.min ?? null,
          c.max ?? null,
          c.altStep ?? null,
          !!c.showOnTv,
        ]),
    ).toEqual([
      ['Ritual rounds', 2, 0, 5, null, true],
      ['Torches', 8, null, null, 5, false],
    ]);

    // The restarted app reopens the campaign with the counters as they were.
    app = await launch(userData, library);
    page = await app.firstWindow();
    await expect(page.getByRole('tab', { name: 'Campaign', exact: true })).toBeVisible();
    await openCounters(page);
    await expect(
      page.getByRole('listitem', { name: 'Ritual rounds' }).getByRole('button', {
        name: /^Ritual rounds: 2/,
      }),
    ).toBeVisible();
    // Still on the TV: its toggle is pressed, and row actions are on screen without a hover.
    await expect(
      page
        .getByRole('listitem', { name: 'Ritual rounds' })
        .getByRole('button', { name: 'Take Ritual rounds off the TV' }),
    ).toHaveAttribute('aria-pressed', 'true');
    const back = page.getByRole('listitem', { name: 'Torches' });
    await expect(back.getByRole('button', { name: /^Torches: 8/ })).toBeVisible();
    await back.getByRole('button', { name: 'Reset Torches to 2' }).click();
    await expect(back.getByRole('button', { name: /^Torches: 2/ })).toBeVisible();
  } catch (err) {
    await keepLogs({ library, userData });
    throw err;
  } finally {
    await app.close();
    await rm(userData, { recursive: true, force: true });
    await rm(library, { recursive: true, force: true });
  }
});
