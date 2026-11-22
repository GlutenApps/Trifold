import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test, type Page } from '@playwright/test';

/**
 * Join a campaign (docs/PLAYER-MODE.md) with two real copies of the app on one machine: a GM's
 * Trifold with the sample campaign and Let players join on, and a player's Trifold, with its own
 * user data and Library and player mode switched on, that joins that table. The player joins by
 * the address the GM's Trifold shows, which works on any network; when the network also carries
 * the search (mDNS), the table is found by itself and the test says so. The player then opens the
 * campaign, picks a character and sees the GM's live map in the player console.
 */

const { ELECTRON_RUN_AS_NODE: _dropped, ...env } = process.env;
const exe = process.env['TRIFOLD_SMOKE_EXE'];
const PORT = 18140;

function launch(userData: string, library: string, extra: Record<string, string>) {
  return electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: [resolve(__dirname, '..')] }),
    env: {
      ...env,
      TRIFOLD_USER_DATA: userData,
      TRIFOLD_NO_SPLASH: '1',
      TRIFOLD_LIBRARY: library,
      ...extra,
    },
  });
}

async function campaignsPage(page: Page) {
  await page
    .getByRole('navigation', { name: 'Library' })
    .getByRole('button', { name: 'Campaigns', exact: true })
    .click();
}

test('a player’s Trifold joins a GM’s table on the local network', async () => {
  const gmData = await mkdtemp(join(tmpdir(), 'trifold-gm-data-'));
  const gmLibrary = await mkdtemp(join(tmpdir(), 'trifold-gm-library-'));
  const playerData = await mkdtemp(join(tmpdir(), 'trifold-player-data-'));
  const playerLibrary = await mkdtemp(join(tmpdir(), 'trifold-player-library-'));

  const gm = await launch(gmData, gmLibrary, { TRIFOLD_TABLE_PORT: String(PORT) });
  let player: Awaited<ReturnType<typeof launch>> | null = null;
  try {
    // The GM opens the sample campaign and lets players join.
    const gmPage = await gm.firstWindow();
    await campaignsPage(gmPage);
    // Without the flag, a GM's Trifold shows nothing of player mode.
    await expect(gmPage.getByRole('button', { name: 'Create campaign' })).toBeVisible();
    await expect(gmPage.getByRole('button', { name: 'Join a campaign' })).toHaveCount(0);
    await gmPage
      .locator('.campaign-card')
      .filter({ hasText: 'The Lantern at Greyford' })
      .getByRole('button', { name: 'Open', exact: true })
      .click({ timeout: 30_000 });
    await gmPage.getByRole('tab', { name: 'VTT', exact: true }).click();
    await gmPage.getByRole('button', { name: 'Player devices', exact: true }).click();
    const pop = gmPage.getByRole('dialog', { name: 'Player devices' });
    await pop.getByRole('button', { name: 'Let players join' }).click();
    const ipText = pop.locator('.join-ip').first();
    const noLan = pop.getByText(/No private network address/);
    await expect(ipText.or(noLan)).toBeVisible({ timeout: 15_000 });
    test.skip(await noLan.isVisible(), 'this machine has no private LAN address');
    const url = (await ipText.textContent())!.trim();
    await gmPage.keyboard.press('Escape');

    // The GM goes live with a map, so there is a table to see (ADR 0046).
    await gmPage.getByTestId('live-strip').getByRole('button', { name: 'Go live (tray)' }).click();
    const sceneRow = gmPage.getByTestId('scene-row').filter({ hasText: 'The Wayside Lamp' });
    const scenesButton = gmPage
      .getByTestId('dock')
      .getByRole('button', { name: 'Scenes tool', exact: true });
    await expect(async () => {
      if (!(await sceneRow.isVisible())) await scenesButton.click();
      await expect(sceneRow).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await sceneRow.click();
    await sceneRow.press('Enter');
    await expect(gmPage.getByTestId('live-status')).toHaveText('Live: The Wayside Lamp');

    // The player's Trifold: its own computer's worth of user data and Library.
    player = await launch(playerData, playerLibrary, { TRIFOLD_PLAYER_MODE: '1' });
    const page = await player.firstWindow();
    await campaignsPage(page);
    await page.getByRole('button', { name: 'Join a campaign' }).click();
    const panel = page.getByTestId('join-campaign');
    await expect(panel).toBeVisible();

    // Found by itself where the network carries the search; typed otherwise.
    const found = panel.getByRole('button', { name: 'Join The Lantern at Greyford' });
    const bySearch = await found
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    test.info().annotations.push({
      type: 'table discovery',
      description: bySearch ? 'the search found the table' : 'not found; joined by address',
    });
    if (bySearch) {
      await found.click();
    } else {
      const typed = panel.getByRole('button', { name: 'Enter an address instead' });
      if (await typed.isVisible()) await typed.click();
      await panel.getByRole('textbox', { name: 'Table address' }).fill(url);
      await panel.getByRole('button', { name: 'Find' }).click();
    }
    await expect(panel.getByText('Join The Lantern at Greyford')).toBeVisible({ timeout: 15_000 });
    await panel.getByRole('textbox', { name: 'Your name at the table' }).fill('Sam');
    await panel.getByRole('button', { name: 'Join', exact: true }).click();

    // The campaign is under Playing, beside the Library's own sample campaign under Running.
    await expect(panel).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Playing' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Running' })).toBeVisible();
    const card = page.getByTestId('playing-campaigns').locator('.campaign-card');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('The Lantern at Greyford');
    await expect(card).toContainText('Playing as Sam');

    // On disk: one folder named by the GM's campaign id, with the address and no claim yet.
    const campaign = JSON.parse(
      await readFile(
        join(gmLibrary, 'campaigns', 'the-lantern-at-greyford', 'campaign.json'),
        'utf8',
      ),
    ) as { id: string };
    const joined = JSON.parse(
      await readFile(join(playerLibrary, 'joined', campaign.id, 'joined.json'), 'utf8'),
    ) as { campaignName: string; displayName: string; addresses: string[]; deviceToken?: string };
    expect(joined).toMatchObject({ campaignName: 'The Lantern at Greyford', displayName: 'Sam' });
    // A typed address is kept as typed. A found table is kept at whichever of the GM's private
    // addresses the search heard first, which on a machine with several adapters need not be the
    // one its Trifold shows.
    if (bySearch) {
      expect(joined.addresses[0]).toMatch(new RegExp(`^\\d+\\.\\d+\\.\\d+\\.\\d+:${PORT}$`));
    } else {
      expect(joined.addresses[0]).toBe(url.replace(/^http:\/\//, ''));
    }
    expect(joined.deviceToken).toBeUndefined();

    // Opening it enters the player console: the GM's shell, the player's tabs, and the picker.
    await card.getByRole('button', { name: 'Open The Lantern at Greyford' }).click();
    await expect(page.getByTestId('joined-crumb')).toHaveText('The Lantern at Greyford');
    await expect(page.getByRole('tab', { name: 'VTT', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Sheets', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Compendium', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Encounters', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Campaign', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('live-strip')).toHaveCount(0);
    await expect(page.getByTestId('player-link')).toHaveText('At the table', { timeout: 20_000 });
    const table = page.getByTestId('player-table');
    await expect(table.getByRole('heading', { name: 'Pick your character' })).toBeVisible();

    // Picking a character puts the player on the map the TV shows, with its picture from main.
    await table.getByRole('button', { name: /Brannoc Hale/ }).click();
    const mapImage = table.locator('.pc-map image, .pc-map img').first();
    await expect(table.locator('.pc-map')).toBeVisible({ timeout: 15_000 });
    await expect(mapImage).toBeAttached({ timeout: 15_000 });
    const src = (await mapImage.getAttribute('href')) ?? (await mapImage.getAttribute('src')) ?? '';
    expect(src).toMatch(/^trifold-media:\/\/table\//);
    // The picture really loads: main fetched it from the GM's table.
    expect(
      await page.evaluate(async (u) => (await fetch(u)).headers.get('content-type'), src),
    ).toBe('image/jpeg');

    // My characters: the player's row, built like the GM's party rows. Damage and a condition go
    // to the GM's table as requests, and the row shows what the table says back.
    const row = page
      .getByTestId('my-characters')
      .getByTestId('my-character')
      .filter({ hasText: 'Brannoc Hale' });
    const chip = row.getByRole('button', { name: "Change Brannoc Hale's HP" });
    await expect(chip).toHaveText(/^HP \d+\/\d+$/);
    const full = (await chip.textContent())!;
    await chip.click();
    await row.getByRole('spinbutton', { name: 'Amount for Brannoc Hale' }).fill('3');
    await row.getByRole('button', { name: 'Damage', exact: true }).click();
    await expect(chip).not.toHaveText(full, { timeout: 10_000 });
    await row.getByRole('button', { name: 'Add a condition to Brannoc Hale' }).click();
    await row.getByRole('menuitem', { name: 'Prone', exact: true }).click();
    await expect(row.getByText('Prone')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('initiative-tool')).toContainText('No fight is running.');

    // With the dock collapsed to its icons, a tool opens as a fly-out and still reads the table.
    await page.getByRole('button', { name: 'Collapse dock to icons' }).click();
    await page.getByRole('button', { name: 'My characters tool' }).click();
    const fly = page.getByRole('dialog', { name: 'My characters' });
    await expect(fly.getByTestId('my-character')).toContainText('Brannoc Hale');
    await page.getByRole('button', { name: 'Initiative tool' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Initiative' }).getByTestId('initiative-tool'),
    ).toContainText('No fight is running.');
    await page.getByRole('button', { name: 'Close flyout' }).click();
    await page.getByRole('button', { name: 'Expand dock' }).click();

    // Quick notes are the player's own, saved in the joined campaign and nowhere else.
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${mod}+n`);
    await page.getByRole('textbox', { name: 'Quick note title' }).fill('The ferryman lied');
    await page.keyboard.press(`${mod}+s`);
    await expect(page.getByTestId('quick-note-row')).toHaveText(/The ferryman lied/, {
      timeout: 10_000,
    });
    const own = join(playerLibrary, 'joined', campaign.id);
    expect(await readdir(join(own, 'notes'))).toHaveLength(1);

    // Search covers the player's own notes, and a found note opens in Quick notes.
    await page.keyboard.press(`${mod}+f`);
    await page.keyboard.type('ferryman');
    await expect(page.getByTestId('pop').getByText('The ferryman lied')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('note-pane').getByLabel('Title')).toHaveValue(
      'The ferryman lied',
    );

    // Dice from the strip: a roll stays on this computer, and a pinned one is kept the same way.
    // The strip's quick pool shows wherever the window has room for it.
    const width = (await page.evaluate('window.innerWidth')) as number;
    if (width > 800) {
      await expect(page.getByTestId('player-strip').getByTestId('dice-pool-compact')).toBeVisible();
    }
    await page
      .getByTestId('player-strip')
      .getByRole('button', { name: 'Dice', exact: true })
      .click();
    const dice = page.getByRole('dialog', { name: 'Dice' });
    await dice.getByRole('textbox', { name: 'Dice expression' }).fill('2d6+1');
    await dice.getByRole('button', { name: 'Roll typed' }).click();
    await dice.getByRole('button', { name: 'Pin 2d6+1' }).click();
    const pinName = dice.getByRole('textbox', { name: 'Name for the pinned 2d6+1 roll' });
    await pinName.fill('Greatsword');
    await pinName.press('Enter');
    await expect(dice.getByTestId('pinned-roll')).toContainText('Greatsword');
    await expect(async () => {
      const [file] = await readdir(join(own, 'pinnedRolls'));
      const pin = JSON.parse(await readFile(join(own, 'pinnedRolls', file!), 'utf8')) as {
        name: string;
      };
      expect(pin.name).toBe('Greatsword');
    }).toPass({ timeout: 10_000 });
    await page.keyboard.press('Escape');

    // The claim is kept in the Library, and the GM sees the player as a device.
    await expect(async () => {
      const now = JSON.parse(
        await readFile(join(playerLibrary, 'joined', campaign.id, 'joined.json'), 'utf8'),
      ) as { deviceToken?: string; lastLiveAt: string | null };
      expect(now.deviceToken).toBeTruthy();
      expect(now.lastLiveAt).not.toBeNull();
    }).toPass({ timeout: 10_000 });
    await gmPage.getByRole('button', { name: 'Player devices', exact: true }).click();
    await expect(pop.getByText(/Sam/).first()).toBeVisible();
    await gmPage.keyboard.press('Escape');

    // Closing the campaign and opening it again lands straight on the character: no picking.
    await page.getByRole('button', { name: 'Close campaign' }).click();
    await expect(page.getByTestId('player-strip')).toHaveCount(0);
    await card.getByRole('button', { name: 'Open The Lantern at Greyford' }).click();
    await expect(table.locator('.pc-map')).toBeVisible({ timeout: 20_000 });
    await expect(table.getByRole('heading', { name: 'Pick your character' })).toHaveCount(0);
    // The note and the pinned roll are still there.
    await page.keyboard.press(`${mod}+n`);
    await expect(page.getByTestId('quick-note-row')).toHaveText(/The ferryman lied/);
    await page.keyboard.press(`${mod}+d`);
    await expect(dice.getByTestId('pinned-roll')).toContainText('Greatsword');
    await page.keyboard.press(`${mod}+d`);

    // The Library is a click away, and the table stays connected behind it.
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await expect(page.getByTestId('player-link')).toHaveText('At the table');

    // The GM's Trifold goes away: the player keeps the map and their character as they last
    // saw them, to look at only.
    await gm.close();
    await card.getByRole('button', { name: 'Back to The Lantern at Greyford' }).click();
    await expect(page.getByTestId('player-link')).not.toHaveText('At the table', {
      timeout: 30_000,
    });
    await expect(table.getByText(/This is the map as you last saw it/)).toBeVisible();
    // Change address is offered while away, and refuses anything off the local network.
    await table.getByRole('button', { name: 'Change address' }).click();
    await table.getByRole('textbox', { name: 'Your GM’s table address' }).fill('example.com');
    await table.getByRole('button', { name: 'Connect' }).click();
    await expect(table.getByRole('alert')).toContainText('not an address on your local network');
    await table.getByRole('button', { name: 'Cancel' }).click();
    await expect(table.locator('.pc-map')).toBeVisible();
    const lastRow = page.getByTestId('my-characters').getByTestId('my-character');
    await expect(lastRow).toContainText('Brannoc Hale');
    await expect(lastRow.getByRole('button')).toHaveCount(0);
    // After closing and opening the campaign it comes from main's cache, the picture included.
    await page.getByRole('button', { name: 'Close campaign' }).click();
    await card.getByRole('button', { name: 'Open The Lantern at Greyford' }).click();
    await expect(table.getByText(/This is the map as you last saw it/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(mapImage).toBeAttached({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Library', exact: true }).click();

    // Leaving takes the folder with it.
    await card.getByRole('button', { name: 'Leave The Lantern at Greyford…' }).click();
    await card.getByRole('button', { name: 'Leave', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Playing' })).toHaveCount(0);
  } finally {
    await player?.close();
    // Already closed when the test got as far as the offline view.
    await gm.close().catch(() => undefined);
  }
});
