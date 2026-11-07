# Changelog

All notable changes to Trifold. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/). Dates are ISO.

## [Unreleased]

## [0.3.0] - 2026-11-07

Everything since the 0.2.0 install pass; the first release built by the release workflow.

### Added

- MIT licence for the code (`LICENSE`, shown by the installer).

- Shell: Library space plus a per-campaign console with a tabbed stage, dock, live strip and saved layouts (ADR 0004); pop-up Dice, Hotkeys and Layouts (ADR 0009); one control scale and UI guidelines (ADR 0013); panel floors and folding (ADR 0014); layouts decide which tabs are open, with new starters.
- TV tab that shows the selected scene and holds every screen control (ADR 0008).
- Campaign notes as a tree of folders with autosave, templates and phrase search (ADR 0010).
- Web tabs hosted in a sandboxed webview (ADR 0011).
- Phone audio: Windows as Bluetooth receiver, macOS AirPlay guide, Audio source toggle (ADR 0007).
- macOS build and CI on both platforms (ADR 0006).
- Fights carry over: PC and named-NPC HP persist, the tracker drives the map, add to a running fight, token links by identity (ADR 0012); one add panel, encounter notes in the fight, heal and temp HP.
- Backups: second backup location, restore from any zip, on-close backup; campaign export and import as `.trifold-campaign` (ADR 0015).
- Smoke test coverage for all of the above on narrow CI runners.
- Release readiness: build guard (`pnpm check:content`) that refuses to package without the fetched SRD snapshot and icon set; app icon rendered from the logo (`pnpm make:icon`); release workflow that builds the Windows installer and portable exe and the macOS dmg and zip for Apple Silicon and Intel from a `v*` tag and drafts a GitHub release; font licences shipped beside the app's resources.
- Logs go to the app's `userData/logs/` until a Library is open, so a failure to open one still leaves a trace.
- User guide, releasing guide, docs index and this changelog.
- Tests for the audio engine's fades, the player-window scene derivation and the close-campaign flow.

### Changed

- Packaged Windows builds no longer carry Electron's stock menu (Alt no longer reveals it); packaged macOS builds drop the Reload and Developer Tools menu items.
- macOS builds are ad-hoc signed so a downloaded build shows Gatekeeper's ordinary prompt instead of "damaged".
- Artifact names no longer contain spaces: `Trifold-Setup-<version>-win-x64.exe`, `Trifold-Portable-<version>-win-x64.exe`, `Trifold-<version>-mac-<arch>.dmg`.
- The portable exe unpacks once into `%TEMP%\Trifold` and reuses it.
- Player-window colours are tokens in `global.css` (`--tv-*`, `--token-*`) instead of literals.
- `DESIGN.md` describes the app as built and marks what is still planned; `DATA-FORMATS.md`, `CLAUDE.md`, the README and ADR 0006 brought up to date.

### Removed

- Dead code left from earlier shapes: the hold toggle (ADR 0012), the adventures IPC namespace, unread shell state and unused exports, dead CSS selectors. A saved fight that still carries `held` has it cleared on resume.

## [0.2.0] - 2026-10-01

First clean-machine install pass: the session-ready cut (`DESIGN.md` §10 M1).

### Added

- Compendium: bundled SRD 2024 and 2014 from an Open5e snapshot, lenient Lion's Den XML import with every convention in `DATA-FORMATS.md` §2, search index with filters, 2024-layout stat block with edition switch, homebrew duplicate and edit for monsters.
- Campaign: campaigns with PC cards and quick add, campaign XML import with notes and NPCs, Fight Club GM export import, ordered notes.
- Encounters and combat: builder with the 2024 budget, initiative, turn loop with recharge and legendary pools, conditions, damage math with temp HP and concentration, death saves, attack, multiattack and save calls from stat blocks, spell slot tracker, roll log export.
- Presenter: player window on a chosen display, scene tree, title, image, map and blank-grid scenes, grid alignment, tokens with game-icons art, party placement, player camera, overlays, blackout, break screen.
- Music: local-file player with crossfades, playlists, loudness normalisation, output device selection, scene linking, tag editing, relinking rescans and loop modes.
- Dice roller with a shared pool and log.
- Daily rolling Library backups with restore.
- The stage, dock and live strip console shell.

## [0.1.0] - 2026-09-27

M0 scaffold: two windows, typed IPC, Library folder with atomic writes, CI.
