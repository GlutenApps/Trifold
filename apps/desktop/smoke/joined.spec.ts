import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { keepLogs } from './keepLogs';
import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { fieldPdf } from './fieldPdf';
import { chooseGameMaster } from './firstRun';

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

function launch(userData: string, library: string, extra: Record<string, string> = {}) {
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
    await chooseGameMaster(gmPage);
    await campaignsPage(gmPage);
    await expect(gmPage.getByRole('button', { name: 'Create campaign' })).toBeVisible();
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
    // Brannoc's token on the map, so the player has one to move.
    await gmPage.getByRole('button', { name: 'Add player characters' }).click();
    await gmPage.getByRole('button', { name: 'Place Brannoc Hale' }).click();
    const canvas = (await gmPage.getByTestId('map-canvas').boundingBox())!;
    await gmPage.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await expect(
      gmPage.getByTestId('console-token').filter({ has: gmPage.locator('[title="Brannoc Hale"]') }),
    ).toHaveCount(1);

    // The player's Trifold: its own computer's worth of user data and Library.
    player = await launch(playerData, playerLibrary);
    const page = await player.firstWindow();

    // The first-run choice (ADR 0077): a new Library asks first. A player's
    // gets no sample campaign, and opens on Join a campaign.
    await page
      .getByTestId('first-run')
      .getByRole('button', { name: /^Player/ })
      .click();
    await expect(page.getByTestId('join-campaign')).toBeVisible();

    // Characters (ADR 0068): the player makes a Trifold character in their Library; its sheet
    // works its numbers out, and the file lands in characters/.
    await page
      .getByRole('navigation', { name: 'Library' })
      .getByRole('button', { name: 'Characters', exact: true })
      .click();
    await page.getByRole('button', { name: 'New character' }).click();
    await page.getByTestId('new-character').getByLabel('Character name').fill('Sam’s rogue');
    await page.getByRole('radio', { name: /Blank sheet/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Dexterity', exact: true }).fill('16');
    await expect(page.getByRole('spinbutton', { name: 'AC', exact: true })).toHaveValue('13');
    await expect(async () => {
      const [file] = await readdir(join(playerLibrary, 'characters'));
      const saved = JSON.parse(await readFile(join(playerLibrary, 'characters', file!), 'utf8'));
      expect(saved).toMatchObject({ name: 'Sam’s rogue', kind: 'trifold' });
      expect(saved.sheet.abilities.dex).toBe(16);
    }).toPass({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Back to characters' }).click();
    await expect(page.getByTestId('character-row')).toContainText('Level 1 · AC 13 · 10 HP');

    // The guided builder (docs/BUILDER.md) on the bundled SRD 5.2.1: a Fighter, a Soldier, a
    // Human, the standard array; nothing is written until Finish.
    await page.getByRole('button', { name: 'New character' }).click();
    await page.getByTestId('new-character').getByLabel('Character name').fill('Tamsin');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    const builder = page.getByTestId('guided-builder');
    await builder.getByRole('radio', { name: /^Fighter/ }).click();
    await builder.getByRole('checkbox', { name: 'Athletics' }).click();
    await builder.getByRole('checkbox', { name: 'Perception' }).click();
    await builder.getByRole('button', { name: 'Next' }).click();
    await builder.getByRole('radio', { name: /^Soldier/ }).click();
    await builder.getByRole('radio', { name: /^Human/ }).click();
    await builder.getByRole('button', { name: 'Next' }).click();
    for (const [ability, value] of [
      ['Strength', '15'],
      ['Constitution', '14'],
      ['Dexterity', '13'],
      ['Wisdom', '12'],
      ['Charisma', '10'],
      ['Intelligence', '8'],
    ] as const) {
      await builder
        .getByRole('combobox', { name: ability, exact: true })
        .selectOption({ label: value });
    }
    await builder.getByRole('combobox', { name: 'Plus 2' }).selectOption('str');
    await builder.getByRole('combobox', { name: 'Plus 1' }).selectOption('con');
    await builder.getByRole('button', { name: 'Next' }).click();
    // Equipment, option A for both: the Fighter's chain mail makes AC 16, its weapons and the
    // Soldier's are attacks, and both options' gold adds up.
    await expect(builder.getByTestId('kit-summary')).toContainText('AC 16');
    await expect(builder.getByTestId('kit-summary')).toContainText('18 GP');
    await builder.getByRole('button', { name: 'Next' }).click();
    // Hit die maximum (d10) plus Con (15: +2) at 1st level.
    await expect(builder.getByTestId('builder-review').getByLabel('Numbers')).toContainText('12');
    await builder.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByTestId('trifold-sheet')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Class 1', exact: true })).toHaveValue(
      'Fighter',
    );
    // Level up: Fighter 2, fixed hit points (d10: 6, plus Con +2).
    await page.getByRole('button', { name: 'Level up' }).click();
    await expect(page.getByTestId('level-up')).toContainText('Level up to Fighter 2');
    await expect(page.getByTestId('levelup-hp')).toContainText('+8 HP, 20 in all');
    await page.getByTestId('level-up').getByRole('button', { name: 'Level up' }).click();
    await expect(page.getByTestId('level-up')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to characters' }).click();
    await expect(page.getByTestId('character-row')).toHaveCount(2);
    await expect(page.getByTestId('character-row').filter({ hasText: 'Tamsin' })).toContainText(
      'Fighter 2 · AC 16 · 20 HP',
    );

    // Import from PDF (ADR 0073): a fillable sheet, made here with SRD content and without the
    // form dictionary the app export also lacks, read by pdf.js in main and previewed first.
    const sheetPdf = join(playerData, 'orrin.pdf');
    await writeFile(
      sheetPdf,
      fieldPdf(
        [
          { name: 'CharacterName', value: 'Orrin Vale', rect: [48, 710, 221, 731] },
          { name: 'ClassLevel', value: 'Wizard 1', rect: [270, 728, 376, 744] },
          { name: 'Race ', value: 'Dwarf', rect: [269, 702, 376, 718] },
          { name: 'Background', value: 'Sage', rect: [384, 728, 470, 744] },
          { name: 'INT', value: '+3', rect: [37, 397, 78, 423] },
          { name: 'INTmod', value: '16', rect: [46, 377, 68, 390] },
          { name: 'AC', value: '12', rect: [234, 626, 261, 651] },
          { name: 'HPMax', value: '8', rect: [291, 585, 380, 595] },
          { name: 'Spells 1014', value: 'Fire Bolt', rect: [40, 607, 199, 620], page: 3 },
        ],
        { withForm: false },
      ),
    );
    await player.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [picked] });
    }, sheetPdf);
    await page.getByRole('button', { name: 'New character' }).click();
    await page.getByRole('radio', { name: /Import from PDF/ }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    const pdfImport = page.getByTestId('pdf-import');
    await pdfImport.getByRole('button', { name: 'Choose PDF…' }).click();
    await expect(pdfImport.getByRole('textbox', { name: 'Name' })).toHaveValue('Orrin Vale');
    await expect(pdfImport.getByTestId('sheet-view')).toContainText('Wizard 1 · Dwarf · Sage');
    await pdfImport.getByRole('button', { name: 'Create character' }).click();
    await expect(page.getByTestId('trifold-sheet')).toBeVisible();
    await page.getByRole('button', { name: 'Back to characters' }).click();
    await expect(page.getByTestId('character-row').filter({ hasText: 'Orrin Vale' })).toContainText(
      'Wizard 1 · AC 12 · 8 HP',
    );

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

    // The campaign is under Playing; Running, this Library's own, is empty for a player.
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
    // The same bar as the GM's: the mark alone, the switcher, Layouts and Settings.
    await expect(page.getByTestId('topbar').getByRole('button', { name: 'Layouts' })).toBeVisible();
    await expect(
      page.getByTestId('topbar').getByRole('button', { name: 'Settings' }),
    ).toBeVisible();
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
    // No sheet is linked yet, so the player is asked for one above the map (ADR 0078).
    await expect(table.getByRole('region', { name: 'Your sheet for Brannoc Hale' })).toBeVisible({
      timeout: 15_000,
    });
    const mapImage = table.locator('.pc-map image, .pc-map img').first();
    await expect(table.locator('.pc-map')).toBeVisible({ timeout: 15_000 });
    await expect(mapImage).toBeAttached({ timeout: 15_000 });
    const src = (await mapImage.getAttribute('href')) ?? (await mapImage.getAttribute('src')) ?? '';
    expect(src).toMatch(/^trifold-media:\/\/table\//);
    // The picture really loads: main fetched it from the GM's table.
    expect(
      await page.evaluate(async (u) => (await fetch(u)).headers.get('content-type'), src),
    ).toBe('image/jpeg');

    // Moving the player's token is a plan until Move here, which a real click must reach.
    const myToken = table.locator('.pc-token.mine.movable').first();
    await expect(myToken).toBeVisible({ timeout: 15_000 });
    let box = (await myToken.boundingBox())!;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(50);
      const next = (await myToken.boundingBox())!;
      if (next.x === box.x && next.y === box.y) break;
      box = next;
    }
    const startAt = await myToken.getAttribute('style');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width, box.y + box.height / 2, { steps: 4 });
    await page.mouse.move(box.x + box.width * 2.5, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    const moveBanner = table.locator('.player-move');
    await expect(moveBanner).toContainText('Moving Brannoc Hale');
    await moveBanner.getByRole('button', { name: 'Move here' }).click();
    await expect(moveBanner).toHaveCount(0, { timeout: 10_000 });
    await expect.poll(() => myToken.getAttribute('style'), { timeout: 10_000 }).not.toBe(startAt);

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

    // Sheets (ADR 0069): the player links the character made in their Library to this campaign
    // and reads it on the Sheets tab, worked out, with the table's live HP above it.
    await page
      .getByTestId('my-characters')
      .getByRole('combobox', { name: 'Link a character' })
      .selectOption({ label: 'Sam’s rogue' });
    await expect(page.getByTestId('character-link')).toContainText('Your sheet: Sam’s rogue');
    await row.getByRole('button', { name: 'Open Brannoc Hale’s sheet' }).click();
    const sheet = page.getByTestId('sheet-view');
    await expect(sheet).toContainText('Sam’s rogue');
    await expect(sheet.getByLabel('Numbers')).toContainText('13');
    await expect(page.getByTestId('sheet-live')).toContainText('Prone');
    // Rolling from the sheet (ADR 0075): Table is the default, so the GM's Trifold makes the
    // roll and it comes back named for what it was. Dexterity 16 makes Stealth +3.
    // A narrow sheet (CI's screens are narrow) keeps skills under an Abilities tab (ADR 0080).
    const abilitiesTab = sheet.getByRole('tab', { name: 'Abilities' });
    if (await abilitiesTab.isVisible()) await abilitiesTab.click();
    await sheet.getByRole('button', { name: 'Roll Stealth check' }).click();
    // The turn bar's readout (ADR 0080): the total, the roll's name, then the dice.
    await expect(sheet.getByTestId('sheet-last-roll')).toContainText(/Stealth check.*1d20\+3/, {
      timeout: 10_000,
    });
    await expect
      .poll(
        async () =>
          JSON.parse(
            await readFile(join(playerLibrary, 'joined', campaign.id, 'joined.json'), 'utf8'),
          ).characterId as string | null,
      )
      .toBeTruthy();
    // Sheet updates (ADR 0071): linking offered the sheet's numbers for the PC held. The GM sees
    // what would change and dismisses it; the player is told. Then the player names the
    // character as the card is named, the new numbers are offered, and the GM accepts them.
    const gmMod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await gmPage.keyboard.press(`${gmMod}+t`);
    await gmPage.getByRole('button', { name: 'Player devices', exact: true }).click();
    const offerRow = pop.getByTestId('sheet-offer');
    await expect(offerRow).toContainText('offers new numbers for Brannoc Hale', {
      timeout: 15_000,
    });
    await expect(offerRow).toContainText('Name Brannoc Hale → Sam’s rogue');
    await expect(offerRow).toContainText(/AC \d+ → 13/);
    await offerRow.getByRole('button', { name: 'Dismiss Brannoc Hale’s new numbers' }).click();
    await expect(page.getByTestId('sheet-answer')).toContainText('kept the numbers they have');
    await page.getByRole('button', { name: 'Edit Sam’s rogue' }).click();
    await page
      .getByTestId('sheet-editing')
      .getByRole('textbox', { name: 'Character name' })
      .fill('Brannoc Hale');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(offerRow).toContainText(/AC \d+ → 13/, { timeout: 15_000 });
    await expect(offerRow).not.toContainText('Name Brannoc');
    await offerRow.getByRole('button', { name: 'Accept Brannoc Hale’s new numbers' }).click();
    await expect(offerRow).toHaveCount(0);
    await expect(page.getByTestId('sheet-answer')).toContainText('took its numbers');
    await expect(row).toContainText('AC 13', { timeout: 10_000 });
    // Linked, the setup card is gone, and the GM reads the sheet on the PC card (ADR 0078).
    await expect(table.getByTestId('sheet-setup')).toHaveCount(0);
    await gmPage.keyboard.press('Escape');
    await gmPage.getByRole('tab', { name: 'Campaign', exact: true }).click();
    await gmPage.getByRole('tab', { name: /^Party/ }).click();
    await gmPage.getByRole('button', { name: 'Read Brannoc Hale’s sheet' }).click({
      timeout: 15_000,
    });
    const shared = gmPage.getByTestId('player-sheet');
    await expect(shared).toContainText('Shared from Sam’s Trifold');
    await expect(shared.getByTestId('sheet-view').getByLabel('Numbers')).toContainText('13');
    await gmPage.getByRole('button', { name: 'Back to the party' }).click();
    await gmPage.keyboard.press(`${gmMod}+t`);
    await gmPage.getByRole('button', { name: 'Player devices', exact: true }).click();

    // New PC from player sheet (ADR 0072): holding nothing, the player asks the GM to add their
    // character; the GM adds it, and the new card is the player's at once.
    await page.getByRole('tab', { name: 'VTT', exact: true }).click();
    await page
      .getByTestId('my-characters')
      .getByRole('button', { name: 'Switch character' })
      .click();
    await expect(table.getByRole('heading', { name: 'Pick your character' })).toBeVisible();
    await page.getByRole('button', { name: 'Ask your GM to add Brannoc Hale' }).click();
    await expect(table.getByText('Asked the DM for Brannoc Hale…')).toBeVisible();
    await expect(offerRow).toContainText('asks to add Brannoc Hale as a new PC', {
      timeout: 15_000,
    });
    await offerRow.getByRole('button', { name: 'Add Brannoc Hale as a PC' }).click();
    await expect(table.getByRole('heading', { name: 'Pick your character' })).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(row).toContainText('AC 13');
    await expect(page.getByTestId('sheet-answer')).toContainText('took its numbers');
    await gmPage.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'VTT', exact: true }).click();

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
    // Table is the default: the roll is made on the GM's computer and lands in both roll logs,
    // named for the player's character (ADR 0059).
    await expect(page.getByTestId('roll-mode')).toHaveText('Table');
    await dice.getByRole('textbox', { name: 'Dice expression' }).fill('2d6+1');
    await dice.getByRole('button', { name: 'Roll typed' }).click();
    const mine = dice.getByTestId('latest-roll');
    await expect(mine).toContainText('Brannoc Hale', { timeout: 10_000 });
    await expect(mine).toContainText('table');
    // The total tumbles before it settles: read it once it has.
    const settled = '[data-testid="roll-reveal"][data-settled="true"]';
    // Settled and showing a number: a slow machine can show the placeholder for a moment first.
    await expect(mine.locator(settled)).toHaveText(/^\d+$/, { timeout: 10_000 });
    const total = (await mine.locator(settled).textContent())!.trim();
    await gmPage
      .getByTestId('live-strip')
      .getByRole('button', { name: 'Dice', exact: true })
      .click();
    const gmDice = gmPage.getByRole('dialog', { name: 'Dice' });
    const theirs = gmDice.getByTestId('latest-roll');
    await expect(theirs).toContainText('Brannoc Hale');
    await expect(theirs).toContainText('2d6+1');
    await expect(theirs.locator(settled)).toHaveText(total, { timeout: 10_000 });
    // Private: rolled on the player's computer, and the GM's log hears nothing of it.
    await dice.getByRole('button', { name: 'Private' }).click();
    await dice.getByRole('textbox', { name: 'Dice expression' }).fill('3d4');
    await dice.getByRole('button', { name: 'Roll typed' }).click();
    await expect(dice.getByTestId('latest-roll')).toContainText('3d4');
    await expect(page.getByTestId('roll-mode')).toHaveText('Private');
    await gmPage.waitForTimeout(1_000);
    // Two table rolls: the Stealth check from the sheet and the 2d6+1; not the private 3d4.
    await expect(gmDice.getByRole('list', { name: 'Roll log' }).getByRole('listitem')).toHaveCount(
      2,
    );
    await gmPage.keyboard.press('Escape');
    await dice.getByRole('button', { name: 'Table' }).click();
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

    // Shared content (ADR 0060): the GM makes a homebrew item and shares it from its page; the
    // player's Trifold fetches it and shows it in this campaign's compendium, to read only.
    await gmPage.evaluate(`(async () => {
      const [hit] = await window.trifold.compendium.suggest('Lantern', { limit: 20 });
      const copy = await window.trifold.homebrew.draft(hit.id);
      await window.trifold.homebrew.save({ ...copy, name: 'Greyford Lantern', displayName: 'Greyford Lantern' });
    })()`);
    await gmPage.keyboard.press(`${mod}+f`);
    await gmPage.keyboard.type('Greyford Lantern');
    await expect(gmPage.getByTestId('pop').getByText('Greyford Lantern').first()).toBeVisible({
      timeout: 10_000,
    });
    await gmPage.keyboard.press('Enter');
    await gmPage.getByRole('button', { name: 'Share with players' }).click();
    await expect(gmPage.getByRole('button', { name: 'Share with players' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(async () => {
      const text = await readFile(join(own, 'shared', 'records.jsonl'), 'utf8');
      expect(text).toContain('Greyford Lantern');
    }).toPass({ timeout: 15_000 });
    await page.keyboard.press(`${mod}+f`);
    await page.keyboard.type('Greyford Lantern');
    await expect(page.getByTestId('pop').getByText('Greyford Lantern').first()).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('shared-badge')).toContainText('Shared by your GM');
    // Both sides say so: the player's compendium counts what the GM shares and can filter by
    // it, and the GM's tab says what players have now.
    await expect(page.getByTestId('shared-status')).toContainText('Your GM shares 1 record');
    await expect(
      page.getByRole('combobox', { name: 'Book' }).getByRole('option', {
        name: 'Shared in The Lantern at Greyford',
      }),
    ).toBeAttached();
    await gmPage.getByRole('tab', { name: 'Campaign', exact: true }).first().click();
    await gmPage.getByRole('tab', { name: /^Shared sources \(1\)/ }).click();
    await expect(gmPage.getByTestId('shared-now')).toContainText(
      'Players at your table have 1 record from you now.',
    );
    await gmPage.getByRole('tab', { name: 'Compendium', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    // Export for players (ADR 0064): while the lantern is shared, the GM writes a player pack.
    // The native save dialog answers with a set path.
    const packPath = join(playerLibrary, '..', `greyford-${Date.now()}.trifold-players`);
    await gm.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
    }, packPath);
    const exported = (await gmPage.evaluate(
      'window.trifold.campaigns.exportForPlayers({ sourceIds: [], collectionIds: [] })',
    )) as { records: number } | null;
    expect(exported?.records).toBeGreaterThanOrEqual(1);

    // A player's own copy stands in for a shared one (ADR 0060). The GM shares the test file's
    // two books (ADR 0067); the player imports the same file; the shared copies step aside and
    // theirs answer.
    const FIXTURE = resolve(__dirname, '..', '..', '..', 'fixtures', 'compendium-sample.xml');
    const gmFile = (await gmPage.evaluate(
      `window.trifold.sources.importFile(${JSON.stringify(FIXTURE)})`,
    )) as { sourceId: string };
    const fileBooks = JSON.stringify([
      'system reference document 5 1',
      'system reference document 5 2 1',
    ]);
    expect(gmFile.sourceId).toBeTruthy();
    await gmPage.evaluate(
      `window.trifold.books.share(${fileBooks}, ${JSON.stringify(campaign.id)}, true)`,
    );
    const fireballFrom = async () =>
      (await page.evaluate(`window.trifold.compendium
        .search({ kind: 'spell', text: 'fireball' })
        .then((r) => r.rows.map((row) => row.sourceName))`)) as string[];
    await expect
      .poll(fireballFrom, { timeout: 15_000 })
      .toContain('Shared in The Lantern at Greyford');
    await page.evaluate(`window.trifold.sources.importFile(${JSON.stringify(FIXTURE)})`);
    await expect
      .poll(fireballFrom, { timeout: 15_000 })
      .not.toContain('Shared in The Lantern at Greyford');
    expect(await fireballFrom()).toContain('compendium-sample');
    await expect(page.getByTestId('shared-status')).toContainText('in your own books');
    await gmPage.evaluate(
      `window.trifold.books.share(${fileBooks}, ${JSON.stringify(campaign.id)}, false)`,
    );

    // Unshared, it leaves the player's Library at once.
    await gmPage.getByRole('button', { name: 'Share with players' }).click();
    await expect(async () => {
      expect(await readdir(own)).not.toContain('shared');
    }).toPass({ timeout: 15_000 });
    await expect(page.getByTestId('shared-status')).toHaveCount(0);
    // Back to each console's VTT tab for what follows.
    await gmPage.keyboard.press(`${mod}+t`);
    await page.keyboard.press(`${mod}+t`);

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
    await page.getByRole('button', { name: 'Campaign: The Lantern at Greyford' }).click();
    await page.getByRole('menuitem', { name: 'Close campaign' }).click();
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
    // Nothing to change while away; only opening its sheet (ADR 0069).
    await expect(lastRow.getByRole('button')).toHaveCount(1);
    await expect(lastRow.getByRole('button')).toHaveAccessibleName('Open Brannoc Hale’s sheet');
    // After closing and opening the campaign it comes from main's cache, the picture included.
    await page.getByRole('button', { name: 'Campaign: The Lantern at Greyford' }).click();
    await page.getByRole('menuitem', { name: 'Close campaign' }).click();
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

    // A player pack brings the campaign back without any table (ADR 0064): Join a campaign ›
    // Open a player pack, the name the GM will see, and the shared lantern is there again.
    await player.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [picked] });
    }, packPath);
    await page.getByRole('button', { name: 'Join a campaign' }).click();
    await page.getByRole('button', { name: 'Open a player pack…' }).click();
    const fromPack = page.getByTestId('join-from-pack');
    await expect(fromPack).toContainText('Join The Lantern at Greyford from a file');
    await fromPack.getByRole('textbox', { name: 'Your name at the table' }).fill('Sam');
    await fromPack.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Playing' })).toBeVisible({ timeout: 10_000 });
    await expect(async () => {
      const text = await readFile(join(own, 'shared', 'records.jsonl'), 'utf8');
      expect(text).toContain('Greyford Lantern');
    }).toPass({ timeout: 10_000 });
  } catch (err) {
    // A failure on CI keeps what both Trifolds' main processes logged.
    await keepLogs({ gmLibrary, gmData, playerLibrary, playerData });
    throw err;
  } finally {
    await player?.close();
    // Already closed when the test got as far as the offline view.
    await gm.close().catch(() => undefined);
  }
});
