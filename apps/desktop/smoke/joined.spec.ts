import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test, type Page } from '@playwright/test';

/**
 * Join a campaign (docs/PLAYER-MODE.md) with two real copies of the app on one machine: a GM's
 * Trifold with the sample campaign and Let players join on, and a player's Trifold, with its own
 * user data and Library and player mode switched on, that joins that table. The player joins by
 * the address the GM's Trifold shows, which works on any network; when the network also carries
 * the search (mDNS), the table is found by itself and the test says so.
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

    // Looking and joining claim nothing: the GM's table has seen no device.
    await expect(pop.getByText(/Sam/)).toHaveCount(0);

    // Leaving takes the folder with it.
    await card.getByRole('button', { name: 'Leave The Lantern at Greyford…' }).click();
    await card.getByRole('button', { name: 'Leave', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Playing' })).toHaveCount(0);
  } finally {
    await player?.close();
    await gm.close();
  }
});
