# ADR 0011 · Web tabs on the stage

**Status:** accepted, 2026-11-06. Clarifies CLAUDE.md ground rule 1 and DESIGN.md §1.2.

## Context

A DM's prep lives in more places than Trifold: a shared document with session notes, a
character sheet on a hosted service, a wiki. At the table those are browser windows behind
the console, and alt-tabbing to them in the middle of a round is the kind of fumbling the
console exists to remove.

Ground rule 1 says the app is local only and makes no network calls at runtime except the
optional update check. Its purpose is that Trifold never phones home: no telemetry, no cloud
backend, no accounts, no content fetched behind the DM's back. A page the DM typed the
address of is none of those.

## Decision

- **Web tabs are majors the DM makes.** The stage's `+` menu gains "New web tab…": an
  address, and the tab opens in that group. The tab list is Library-wide, stored in
  `library.json` under `workspace.webTabs` beside the layouts, so it travels with the
  Library and its backups. A layout names a web tab as `web:<ulid>`; the schema's `TabKey`
  is a major kind or such a key. No schema version bump: the change is additive, and a
  layout that names a removed tab is pruned when it loads.
- **Each tab is an Electron `<webview>`** in one persistent session partition
  (`persist:web`), so a login survives a relaunch like it does in a browser. The guest is a
  sandboxed page with no preload and no node; only http(s) loads; a link that asks for a new
  window opens in the system browser; the player window never hosts one.
- **The session presents a Firefox user agent.** Some sign-in flows refuse what they
  recognise as an embedded browser. Dropping the Electron token from Chromium's own string is
  not enough: Chromium also sends client-hint headers that say "Chromium, not Chrome", and
  the mismatch is what trips the check. A Firefox string sidesteps it, because Firefox sends
  no client hints and the page has nothing to compare. This is the standing practice in
  multi-service Electron apps, not a guarantee: every web tab also has "Open in system
  browser" so a page that refuses is one click from the DM's normal browser.
- **Scripted pop-ups stay in the app.** A "Log in with…" button opens a pop-up for the
  sign-in hand-off and waits for it to report back. Such a window (`window.open` with
  features) becomes a child window of the console in the same session, under the same
  guards; a link that merely wants a new tab goes to the system browser.
- **The saved address is the DM's, not the page's.** A tab is made with a name, an address
  and an icon (twelve marks, none a tool's). Browsing inside the tab never changes the saved
  address; Home returns to it, and the edit panel's "Use current page" is the one way to
  move it. (The first cut let every navigation, including sub-frame hover cards, overwrite
  the address, which stranded a tab on a widget's URL.) A blank name follows the page title.
- **Zoom is per tab and saved.** The bar's zoom out, readout (click to reset) and zoom in
  walk the browser's usual steps; Ctrl+=, Ctrl+- and Ctrl+0 do the same for the tab that is
  active in the focused group, including when typed inside the page. Chromium keeps zoom per
  site, so the tab puts its own factor back after every navigation. Two tabs on the same
  site still share one live zoom until the next page load; accepted.
- **Hotkeys reach through the page.** A modifier combo (Ctrl, Alt or Cmd) pressed inside a
  web page is echoed to the console, which runs the matching hotkey if it has one. The page
  keeps its own copy of the key, so a combo both sides use does both things; plain keys stay
  with the page so typing in a document is never intercepted.
- **Closing a web tab parks it; removing it forgets it.** The tab's × closes it (the page
  unloads and the tab waits in the `+` menu); the bar's Remove drops it from the Library and
  from every saved layout. Switching away keeps the page loaded.
- **Rule 1 reads:** no network calls at runtime except the optional update check *and the
  pages the DM opens in web tabs*. Nothing in the repo, the UI or the defaults names a site;
  addresses are the DM's data.

## Consequences

- One Chromium process per open web tab, roughly 100 to 300 MB each; heavy pages cost what
  they cost in a browser. A tab that is closed costs nothing.
- Offline at the table, a web tab shows a plain failure with Try again and Open in system
  browser instead of a blank panel.
- The webview tag is marked "not recommended" in Electron's docs in favour of
  `WebContentsView`, which is a native layer the main process positions over the window.
  The tag keeps the page in the DOM, so stage splits, drags, flyouts and pop-ups layer over
  it with no extra plumbing; that outweighs the warning for now. Revisit if a release breaks
  it.
- Moving a web tab between groups remounts the guest and reloads the page. Rare enough to
  accept.
- Not done: a per-tab zoom, find in page, downloads from a page (Electron's default save
  dialog handles them), an app-mode window using the system browser's own profile.
