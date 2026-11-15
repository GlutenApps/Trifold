import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The player connector, Phase 1 (ADR 0043, docs/PLAYER-CONNECTOR.md) inside real Electron: the
 * sample campaign with Brannoc flagged and a map carrying fog, a hidden Gorm Tallow and a lurker
 * under fog; Let players join on a test port; a browser window on the LAN address claims Brannoc,
 * sees the fogged map and his numbers, reconnects after a reload, is released by the DM and sees
 * the table stop. No WebSocket frame ever names what is hidden or fogged.
 */

const { ELECTRON_RUN_AS_NODE: _dropped, ...env } = process.env;
const exe = process.env['TRIFOLD_SMOKE_EXE'];
const PORT = 18130;

function launch(userData: string, library: string) {
  return electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: [resolve(__dirname, '..')] }),
    env: {
      ...env,
      TRIFOLD_USER_DATA: userData,
      TRIFOLD_LIBRARY: library,
      TRIFOLD_TABLE_PORT: String(PORT),
    },
  });
}

async function openTool(page: Page, tool: string, marker: Locator) {
  const button = page
    .getByTestId('dock')
    .getByRole('button', { name: `${tool} tool`, exact: true });
  await expect(async () => {
    if (!(await marker.isVisible())) await button.click();
    await expect(marker).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/** The sample campaign's folder once the first run has written its party and scenes. */
async function sampleDir(library: string): Promise<string> {
  let found: string | null = null;
  await expect(async () => {
    for (const slug of await readdir(join(library, 'campaigns'))) {
      const scenes = await readdir(join(library, 'campaigns', slug, 'scenes')).catch(() => []);
      if (scenes.length) found = join(library, 'campaigns', slug);
    }
    expect(found).not.toBeNull();
  }).toPass({ timeout: 30_000 });
  return found!;
}

/** A record file in one of the campaign's folders, found by its name or title (ids are ULIDs). */
async function fileNamed(
  dir: string,
  folder: string,
  name: string,
): Promise<{ file: string; id: string }> {
  for (const file of await readdir(join(dir, folder))) {
    const doc = JSON.parse(await readFile(join(dir, folder, file), 'utf8')) as {
      id: string;
      name?: string;
      title?: string;
    };
    if (doc.name === name || doc.title === name)
      return { file: join(dir, folder, file), id: doc.id };
  }
  throw new Error(`no ${folder} record named ${name}`);
}

async function editJson(file: string, edit: (doc: Record<string, unknown>) => void) {
  const doc = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  edit(doc);
  await writeFile(file, JSON.stringify(doc, null, 2));
}

test('players join on the LAN, claim a PC, see only what they may, and are released', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'trifold-userdata-'));
  const library = await mkdtemp(join(tmpdir(), 'trifold-library-'));

  // First run: the Library gets the sample campaign (ADR 0016). Then set the table up on disk.
  let app = await launch(userData, library);
  await app.firstWindow();
  const dir = await sampleDir(library);
  await app.close();

  const brannoc = await fileNamed(dir, 'pcs', 'Brannoc Hale');
  const gorm = await fileNamed(dir, 'npcs', 'Gorm Tallow');
  const tobin = await fileNamed(dir, 'npcs', 'Tobin Marsh');
  // Hesper travels with Brannoc as his companion (Phase 3).
  const hesper = await fileNamed(dir, 'npcs', 'Hesper Quill');
  await editJson(hesper.file, (npc) => {
    npc['companionOf'] = brannoc.id;
  });
  const inn = await fileNamed(dir, 'scenes', 'The Wayside Lamp');
  // Brannoc is left as the sample has him: party members are claimable by default.
  await editJson(inn.file, (scene) => {
    const image = scene['image'] as { width: number; height: number };
    const grid = (scene['grid'] as { cellPx?: number } | undefined) ?? {};
    const cell = grid.cellPx ?? 70;
    const lastCol = Math.floor(image.width / cell) - 2;
    const base = { footprint: 1, nameMasked: false, dead: false };
    scene['tokens'] = [
      {
        ...base,
        id: 'tok-brannoc',
        kind: 'pc',
        ref: { kind: 'pc', pcId: brannoc.id, name: 'Brannoc Hale' },
        label: 'Brannoc Hale',
        x: 1,
        y: 1,
        role: 'ally',
        hidden: false,
      },
      {
        ...base,
        id: 'tok-gorm',
        kind: 'creature',
        ref: { kind: 'npc', npcId: gorm.id, name: 'Gorm Tallow' },
        label: 'Gorm Tallow',
        x: 2,
        y: 1,
        role: 'enemy',
        hidden: true,
      },
      {
        ...base,
        id: 'tok-tobin',
        kind: 'creature',
        ref: { kind: 'npc', npcId: tobin.id, name: 'Tobin Marsh' },
        label: 'Tobin Marsh',
        x: 2,
        y: 3,
        role: 'ally',
        hidden: false,
      },
      {
        ...base,
        id: 'tok-lurker',
        kind: 'creature',
        ref: { kind: 'custom', name: 'Lurker in the dark' },
        label: 'Lurker in the dark',
        x: lastCol,
        y: 1,
        role: 'enemy',
        hidden: false,
      },
    ];
    scene['fog'] = {
      enabled: true,
      shapes: [
        {
          id: 'fog-left',
          mode: 'reveal',
          kind: 'rect',
          x: 0,
          y: 0,
          // The first five columns: Brannoc, Tobin and a two-cell move fit; a four-cell move
          // from there lands under fog and still on the map.
          w: 5 * cell,
          h: image.height,
        },
      ],
    };
  });

  app = await launch(userData, library);
  try {
    const page = await app.firstWindow();
    await page
      .getByRole('navigation', { name: 'Library' })
      .getByRole('button', { name: 'Campaigns', exact: true })
      .click();
    await page
      .locator('.campaign-card')
      .filter({ hasText: 'The Lantern at Greyford' })
      .getByRole('button', { name: 'Open', exact: true })
      .click();
    await expect(page.getByRole('tab', { name: 'VTT', exact: true })).toBeVisible();

    // Send the map to the TV: phones follow the TV.
    const row = page.getByTestId('scene-row').filter({ hasText: 'The Wayside Lamp' });
    await openTool(page, 'Scenes', row);
    await row.click();
    await row.press('Enter');
    await expect(page.getByTestId('live-status')).toHaveText('Live: The Wayside Lamp');

    // Let players join, from the VTT tab's Player devices pop-up.
    await page.getByRole('tab', { name: 'VTT', exact: true }).click();
    await page.getByRole('button', { name: 'Player devices', exact: true }).click();
    const pop = page.getByRole('dialog', { name: 'Player devices' });
    await pop.getByRole('button', { name: 'Let players join' }).click();
    const ipText = pop.locator('.join-ip').first();
    const noLan = pop.getByText(/No private network address/);
    await expect(ipText.or(noLan)).toBeVisible({ timeout: 15_000 });
    test.skip(await noLan.isVisible(), 'this machine has no private LAN address');
    const url = (await ipText.textContent())!.trim();
    expect(url).toMatch(new RegExp(`^http://\\d+\\.\\d+\\.\\d+\\.\\d+:${PORT}$`));

    // A phone: a plain browser window on the LAN address.
    const frames: string[] = [];
    const phonePromise = app.waitForEvent('window');
    await app.evaluate(({ BrowserWindow }, target) => {
      const win = new BrowserWindow({ width: 390, height: 800, title: 'phone' });
      void win.loadURL(target);
    }, url);
    const phone = await phonePromise;
    phone.on('websocket', (ws) => {
      ws.on('framereceived', (f) => frames.push(String(f.payload)));
    });
    await expect(phone.getByRole('heading', { name: 'Pick your character' })).toBeVisible({
      timeout: 15_000,
    });
    await phone.getByLabel('This device’s name (optional)').fill('Smoke phone');
    await phone.getByRole('button', { name: /Brannoc Hale/ }).click();

    // The redesigned page (player UI handoff): on a phone in portrait, the character strip.
    const stats = phone.getByRole('button', { name: 'Brannoc Hale, open health' });
    await expect(stats).toBeVisible();
    // His companion came with him: she is in play in the Companions tool, with a Remove.
    const tools = phone.getByRole('navigation', { name: 'Character tools' });
    await tools.getByRole('button', { name: 'Companions' }).click();
    await expect(
      phone.getByRole('button', { name: 'Remove Hesper Quill from play' }),
    ).toBeVisible();
    await tools.getByRole('button', { name: 'Companions' }).click();
    // Brannoc and Tobin: Gorm is hidden and the lurker stands under fog.
    await expect(phone.getByTestId('pc-token')).toHaveCount(2);
    // The fogged map image the console drew arrives and loads.
    await expect
      .poll(
        () =>
          phone
            .locator('.pc-map-art')
            .evaluate((img) => (img as unknown as { naturalWidth: number }).naturalWidth),
        {
          timeout: 15_000,
        },
      )
      .toBeGreaterThan(0);
    await expect(pop.getByText('Smoke phone')).toBeVisible();
    await expect(pop.getByText('Brannoc Hale')).toBeVisible();

    // A reload reconnects with the stored token, straight to Brannoc.
    await phone.reload();
    await expect(stats).toBeVisible({ timeout: 15_000 });
    await expect(phone.getByTestId('pc-token')).toHaveCount(2);

    // Nothing hidden or fogged has reached the phone. (Checked before the fight, which may
    // reveal its own creatures.)
    const wire = frames.join('\n');
    expect(wire).toContain('Brannoc Hale');
    expect(wire).not.toContain('Gorm');
    expect(wire).not.toContain('Lurker');
    expect(wire).not.toContain('tok-lurker');
    expect(wire).not.toContain('tok-gorm');

    // Phase 2: the fight asks for Brannoc's initiative and the phone answers it once. He joins
    // the linked encounter because his token stands on the map (ADR 0044).
    await page.getByRole('tab', { name: 'VTT', exact: true }).click();
    await page.getByRole('button', { name: 'Start linked encounter' }).click();
    const initiative = phone.getByLabel('Initiative');
    await expect(initiative).toBeVisible({ timeout: 15_000 });
    await initiative.fill('15');
    await phone.getByRole('button', { name: 'Submit' }).click();
    await expect(initiative).toBeHidden();

    // Damage and a condition from the phone land in the tracker.
    await tools.getByRole('button', { name: 'Health' }).click();
    await expect(phone.getByLabel('Amount', { exact: true })).toHaveValue('5');
    await phone.getByRole('button', { name: 'Damage' }).click();
    await expect(stats).toContainText('26');
    await tools.getByRole('button', { name: 'Conditions' }).click();
    await phone.getByRole('button', { name: 'Prone', exact: true }).click();
    await expect(phone.getByRole('button', { name: 'Prone', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(tools.getByRole('button', { name: /Conditions/ })).toContainText('1');
    // Close the sheet so the map takes the next taps.
    await tools.getByRole('button', { name: /Conditions/ }).click();

    // Switch character, then Undo within the few seconds.
    await phone.getByRole('button', { name: 'Switch character' }).click();
    await expect(phone.getByText(/Released Brannoc Hale/)).toBeVisible();
    await phone.getByRole('button', { name: 'Undo' }).click();
    await expect(stats).toBeVisible();

    // Phase 3: the phone drags Brannoc two cells right, into the revealed half.
    await page.getByRole('tab', { name: 'VTT', exact: true }).click();
    const consoleBrannoc = page
      .getByTestId('console-token')
      .filter({ has: page.locator('[title="Brannoc Hale"]') });
    const consoleLeft = () =>
      consoleBrannoc.evaluate((el) => (el as unknown as { style: { left: string } }).style.left);
    const before = await consoleLeft();
    const phoneBrannoc = phone.locator('[data-token-id="tok-brannoc"]');
    const dragOnPhone = async (cells: number, release = true) => {
      const box = (await phoneBrannoc.boundingBox())!;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await phone.mouse.move(cx, cy);
      await phone.mouse.down();
      await phone.mouse.move(cx + (box.width * cells) / 2, cy, { steps: 4 });
      await phone.mouse.move(cx + box.width * cells, cy, { steps: 4 });
      if (release) await phone.mouse.up();
    };
    await dragOnPhone(2);
    await expect.poll(consoleLeft).not.toBe(before);
    const afterMove = await consoleLeft();
    const cellPx = await consoleBrannoc.evaluate((el) =>
      parseFloat((el as unknown as { style: { width: string } }).style.width),
    );
    expect(parseFloat(afterMove) - parseFloat(before)).toBeCloseTo(2 * cellPx, 0);

    // A drop under fog is refused and Brannoc stays put.
    await dragOnPhone(4);
    await expect(phone.getByText('You can’t see that spot.')).toBeVisible();
    await phone.getByRole('button', { name: 'OK', exact: true }).click();
    expect(await consoleLeft()).toBe(afterMove);

    // The DM grabbing Brannoc mid-drag wins; the phone's drag ends.
    await dragOnPhone(1, false);
    await expect(page.getByTestId('token-mover')).toHaveText('Smoke phone');
    const dmBox = (await consoleBrannoc.boundingBox())!;
    await page.mouse.move(dmBox.x + dmBox.width / 2, dmBox.y + dmBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(dmBox.x + dmBox.width / 2, dmBox.y + dmBox.height * 1.6, { steps: 4 });
    await page.mouse.up();
    await expect(phone.getByText('The DM moved Brannoc Hale.')).toBeVisible();
    await phone.mouse.up();
    await phone.getByRole('button', { name: 'OK', exact: true }).click();

    // Lock movement: the phone says so.
    await page.getByRole('button', { name: 'Player devices', exact: true }).click();
    // The box shows main's answer, so click and wait rather than check().
    const lockAll = pop.getByRole('checkbox', { name: 'Lock movement' });
    await lockAll.click();
    await expect(lockAll).toBeChecked();
    await expect(phone.getByText('Movement locked by the DM')).toBeVisible();
    await lockAll.click();
    await expect(lockAll).not.toBeChecked();
    await expect(phone.getByText('Movement locked by the DM')).toBeHidden();

    // Approval mode: a second device asks to take Brannoc over and the DM accepts.
    const openPop = async () => {
      await page.getByRole('tab', { name: 'VTT', exact: true }).click();
      if (!(await pop.isVisible()))
        await page.getByRole('button', { name: 'Player devices', exact: true }).click();
      await expect(pop).toBeVisible();
    };
    await openPop();
    await pop.getByRole('combobox', { name: 'Getting a character back' }).selectOption('approval');
    const tabletPromise = app.waitForEvent('window');
    await app.evaluate(({ BrowserWindow }, target) => {
      const win = new BrowserWindow({
        width: 400,
        height: 800,
        title: 'tablet',
        webPreferences: { partition: 'smoke-tablet' },
      });
      void win.loadURL(target);
    }, url);
    const tablet = await tabletPromise;
    await expect(tablet.getByRole('heading', { name: 'Pick your character' })).toBeVisible({
      timeout: 15_000,
    });
    await tablet.getByLabel('This device’s name (optional)').fill('Smoke tablet');
    await tablet.getByRole('button', { name: /Brannoc Hale/ }).click();
    await tablet.getByRole('button', { name: 'Take over' }).click();
    await expect(tablet.getByText('Asked the DM for Brannoc Hale…')).toBeVisible();
    await expect(page.getByTestId('players-waiting')).toBeVisible();
    await openPop();
    await expect(pop.getByText('Smoke tablet wants to take over Brannoc Hale')).toBeVisible();
    await pop.getByRole('button', { name: 'Accept' }).click();
    await expect(tablet.getByRole('button', { name: 'Brannoc Hale, open health' })).toBeVisible();
    await tablet
      .getByRole('navigation', { name: 'Character tools' })
      .getByRole('button', { name: 'Companions' })
      .click();
    await expect(
      tablet.getByRole('button', { name: 'Remove Hesper Quill from play' }),
    ).toBeVisible();
    await expect(phone.getByRole('heading', { name: 'Pick your character' })).toBeVisible();
    await expect(phone.getByText('Brannoc Hale was picked up on another device.')).toBeVisible();

    // Give to…: the DM hands Tobin to the phone from his token on the map.
    await page.getByRole('tab', { name: 'VTT', exact: true }).click();
    await page
      .getByTestId('console-token')
      .filter({ has: page.locator('[title="Tobin Marsh"]') })
      .click();
    await page.getByRole('button', { name: 'Give Tobin Marsh to a player' }).click();
    await page
      .getByRole('dialog', { name: 'Give Tobin Marsh to a player' })
      .getByRole('button', { name: 'Smoke phone' })
      .click();
    await expect(phone.getByRole('button', { name: 'Tobin Marsh, open health' })).toBeVisible();

    // The DM releases him: back to the picker, nothing else changes.
    await openPop();
    await pop.getByRole('button', { name: 'Release Brannoc Hale' }).click();
    await expect(tablet.getByRole('heading', { name: 'Pick your character' })).toBeVisible();

    // Stop: the pages say so.
    await pop.getByRole('button', { name: 'Stop' }).click();
    await expect(phone.getByText('The DM stopped the table')).toBeVisible();
    await expect(tablet.getByText('The DM stopped the table')).toBeVisible();

    // The phone windows are the test's own; the app quits when its last window closes.
    await tablet.close();
    await phone.close();
  } finally {
    await app.close();
  }
});
