# ADR 0006 · One app for Windows and macOS

**Status:** accepted, 2026-11-06. Changes the "Windows-only" row of the decision log in
`DESIGN.md` §2.

## Context

Trifold was designed and tested as a Windows app. The DM now runs sessions from a Mac as
well. The code was already platform-neutral in the ways that matter: files-first storage
under `app.getPath('documents')`, Web Audio for sound, the renderer never touching the OS,
and no native module beyond better-sqlite3, which ships macOS prebuilds for the pinned
Electron (ADR 0001).

## Decision

One codebase, one renderer, one set of features. The platform shows up in exactly four
places, and nowhere else:

1. **Build.** `electron-builder.yml` gains a `mac` target (dmg + zip) for the architecture of
   the build machine. `scripts/rebuild-native.mjs` already fetches better-sqlite3 for the host
   arch (or `npm_config_arch`), so a universal binary is not attempted. Builds are ad-hoc
   signed (`identity: "-"`) until a Developer ID exists: Gatekeeper then shows the ordinary
   unidentified-developer prompt, and on macOS 15 the first launch is System Settings →
   Privacy & Security → Open Anyway (right-click → Open no longer bypasses it). CI runs the whole
   check, smoke test included, on both `windows-latest` and `macos-latest`.
2. **Menu.** macOS gets a minimal application menu (`src/main/menu.ts`) so Cmd+C/V/X/A, Hide
   and Quit behave; Windows keeps its hidden default menu. Closing the console window quits
   the app on both platforms: the console *is* the app, and the player window and audio must
   never outlive it.
3. **Windows.** The console's frameless title bar uses `hiddenInset` with the traffic lights
   at the left on macOS and `titleBarOverlay` at the right on Windows. The renderer marks
   `<html data-platform>` at startup and the top bar's CSS leaves the right space free. The
   player window uses `simpleFullscreen` on macOS so it covers the TV without creating a Space.
4. **Keys.** Hotkeys are registered once, Windows-style (`Ctrl+Alt+P`). `comboFromEvent`
   treats the Command key as `Ctrl` on macOS, so every registration works unchanged, and
   `hk()` in `src/renderer/platform.ts` renders a combo for display (`⌘⌥P`). No feature
   writes a literal "Ctrl+…" in UI text.

Everything else (Library layout, importers, index, presenter, music, backups, smoke test) is
identical and unaware of the OS.

## Consequences

- A Windows-only assumption anywhere is a bug. Paths are built with `node:path`, never with a
  literal separator; music folder matching is case-insensitive, which is right on both
  NTFS and the default APFS.
- The macOS build has not yet been exercised on real hardware by the maintainer; CI's macOS
  job is the gate until it has. Mixed-DPI and second-display behaviour on macOS needs the
  same hands-on check that Windows had (DESIGN.md §11).
- Code signing and notarization are still M3. Until then, Gatekeeper warns on first launch and
  the README carries the Open Anyway steps.
