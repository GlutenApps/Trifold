# ADR 0053 · Updates show their progress and install in seconds

**Status:** accepted, 2026-11-21. Amends ADR 0045 (the installer no longer runs silently).

## Context

The first self-update, 0.4.3 to 0.4.4, worked, but **Restart now** looked broken. Trifold closed
and nothing appeared until 0.4.4 opened 8 minutes later. Thinking it had crashed, the DM opened
Trifold again by hand about 4½ minutes in, while 0.4.3 was still being removed.

Two things caused this:

- **Nothing was on screen.** ADR 0045 ran the installer silently (`/S`), so between the old
  version closing and the new one opening there was no window at all.
- **The install was slow.** The installed app was 4,280 files, and 4,176 of them were the
  game-icons SVGs. An update deletes every old file and writes every new one, and Windows'
  antivirus checks each one. On the DM's machine, which also runs endpoint security software,
  removing 0.4.3 took about 6 minutes and writing 0.4.4 about 2¼ minutes.

## Decision

1. **The update shows the installer's progress window.** **Restart now** starts the installer
   with `--updated --force-run` and without `/S`. `build/installer.nsh` skips every page but the
   progress bar when `--updated` is set:
   - Welcome: skipped.
   - Install mode: the update keeps the mode the current install has. The page shows only if
     both a per-user and a per-machine copy exist.
   - Folder: skipped (electron-builder does this already).
   - Finish: skipped. The installer starts the new version and closes.

   The progress page's heading reads "Updating Trifold: Trifold opens again by itself when this
   finishes", so nobody starts it by hand halfway through. A fresh install keeps every page,
   from the welcome page with the logo to the finish page with "Run Trifold".
2. **The icons ship as one file.** `scripts/fetch-game-icons.ts` packs every SVG into
   `resources/icons/glyphs.json` (`{ "<name>": "<svg>" }`, 6.9 MB), not
   `resources/icons/svg/<name>.svg`. The main process reads the bundle once
   (`IconResources.svg`). The media scheme and the table server serve glyphs as text from it.
   `check-content` refuses a leftover `svg/` folder, so the old layout cannot ship by mistake.

## Consequences

- **The app went from 4,280 files to 105.** Measured on the DM's machine:

  | Update | Before | Now |
  |---|---|---|
  | 0.4.4 to the first version with this change (deletes the old icon files one last time) | | 48 s |
  | between versions with this change | 8 min (0.4.3 to 0.4.4, with the extra launch) | 30 s |

  Fresh installs and uninstalls speed up the same way.
- **The DM sees the update from start to finish:** a small Trifold window with a progress bar,
  then Trifold.
- **An app still running when the installer starts** is closed by the installer as before. On
  an update it waits a moment and closes it without asking.
- **The glyph bundle stays in memory** once a token or the About page needs it (about 7 MB).
- **macOS is unchanged.** It keeps the release page until it is notarized (ADR 0045). The icon
  bundle applies there too.
