import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test } from '@playwright/test';
import { keepLogs } from './keepLogs';

/**
 * Web tabs (ADR 0011) inside real Electron: the webview attaches, loads a page from a local
 * http server, reports its title to the tab, carries a browser-like user agent, echoes a
 * hotkey to the console, and is saved to the Library.
 */

/** The page sets its title to its own user agent, so the tab label tells us what the guest sent. */
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>loading</title></head>
<body><h1>Web tab check</h1><input id="box" autofocus>
<script>document.title = 'UA ' + navigator.userAgent;</script></body></html>`;

function serve(): Promise<Server> {
  return new Promise((done) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(PAGE);
    });
    server.listen(0, '127.0.0.1', () => done(server));
  });
}

test('a web tab hosts a page, follows its title and survives in the Library', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'trifold-userdata-'));
  const library = await mkdtemp(join(tmpdir(), 'trifold-library-'));
  const server = await serve();
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/notes`;
  const { ELECTRON_RUN_AS_NODE: _dropped, ...env } = process.env;
  const exe = process.env['TRIFOLD_SMOKE_EXE'];
  const app = await electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: [resolve(__dirname, '..')] }),
    env: { ...env, TRIFOLD_USER_DATA: userData, TRIFOLD_LIBRARY: library },
  });

  try {
    const console_ = await app.firstWindow();
    const rendererErrors: string[] = [];
    console_.on('console', (msg) => {
      if (msg.type() === 'error') rendererErrors.push(msg.text());
    });
    await console_
      .getByRole('navigation', { name: 'Library' })
      .getByRole('button', { name: 'Campaigns', exact: true })
      .click();
    await console_.getByRole('button', { name: 'Create campaign' }).click();
    await console_.getByLabel('New campaign name').fill('Web Campaign');
    await console_.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(console_.getByRole('tab', { name: 'Campaign', exact: true })).toBeVisible();

    // Add the tab from the + menu of group 1.
    await console_.getByRole('button', { name: 'Add a tab to group 1' }).click();
    await console_.getByRole('menuitem', { name: 'New web tab…' }).click();
    await console_.getByRole('textbox', { name: 'Web address' }).fill(url);
    await console_.getByRole('button', { name: 'Add web tab' }).click();

    // The guest loaded: the tab took the page's title, which carries the guest's user agent.
    const tab = console_.getByRole('tab', { name: /^UA / });
    await expect(tab).toBeVisible({ timeout: 20_000 });
    const title = (await tab.getAttribute('aria-label')) ?? '';
    expect(title).toContain('Firefox/');
    expect(title).not.toMatch(/electron|trifold|chrome/i);

    // A modifier combo typed inside the page reaches the console's hotkeys (Ctrl+/ = sheet).
    // "Ctrl" in a combo is the Command key on macOS (ADR 0006), so press that one there.
    const guest = console_.locator('webview');
    await guest.click();
    await console_.keyboard.press(process.platform === 'darwin' ? 'Meta+/' : 'Control+/');
    await expect(console_.getByRole('dialog', { name: 'Hotkeys' })).toBeVisible({
      timeout: 10_000,
    });
    await console_.keyboard.press('Escape');

    // Saved with the Library's workspace, under the key the layout uses.
    await expect
      .poll(async () => {
        const settings = JSON.parse(await readFile(join(library, 'library.json'), 'utf8'));
        return settings.workspace.webTabs?.[0]?.url;
      })
      .toBe(url);
    const settings = JSON.parse(await readFile(join(library, 'library.json'), 'utf8'));
    const key = `web:${settings.workspace.webTabs[0].id}`;
    expect(settings.workspace.consoles['web-campaign'].stage.groups[0].tabs).toContain(key);

    // Close parks it; the + menu offers it back by name.
    await tab.getByRole('button', { name: /^Close .* tab$/ }).click();
    await expect(console_.getByRole('tab', { name: /^UA / })).toHaveCount(0);
    await console_.getByRole('button', { name: 'Add a tab to group 1' }).click();
    await expect(console_.getByRole('menuitem', { name: /^UA / })).toBeVisible();

    expect(rendererErrors).toEqual([]);
  } catch (err) {
    await keepLogs({ library, userData });
    throw err;
  } finally {
    await app.close();
    server.close();
    await rm(userData, { recursive: true, force: true });
    await rm(library, { recursive: true, force: true });
  }
});
