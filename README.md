# Trifold

A local desktop console (Windows and macOS) for a Dungeon Master running 5e-compatible games at a physical table: compendium, campaign notes, encounters and combat tracker, a second-screen presenter, and a music controller.

Everything stays on your machine. There are no accounts, no cloud services and no telemetry. Your data lives in a plain folder of JSON files and media (the Library) that you can back up, copy or sync however you like. To play music from your phone's own apps through the laptop, open the Music tool's Phone tab: on Windows 11 Trifold is the Bluetooth audio receiver, so a paired phone connects in one click; on macOS it walks you to AirPlay Receiver. An "Audio source" toggle switches the Music tool and the live strip between Trifold's own player and the phone.

- Using the app: [docs/USER-GUIDE.md](docs/USER-GUIDE.md)
- What the app is and why: [docs/DESIGN.md](docs/DESIGN.md)
- File formats and parsing rules: [docs/DATA-FORMATS.md](docs/DATA-FORMATS.md)
- Repo conventions for contributors: [CLAUDE.md](CLAUDE.md)
- Architecture decisions: [docs/adr/](docs/adr/), indexed in [docs/README.md](docs/README.md)
- Building a release: [docs/RELEASING.md](docs/RELEASING.md)
- What changed: [CHANGELOG.md](CHANGELOG.md)

## Status

Feature complete for the session-ready cut (`DESIGN.md` §10, M1) and beyond it: compendium with bundled SRD and XML import, campaign notes tree, encounters and combat tracker with carry-over, second-screen presenter with maps and tokens, music with crossfade and phone audio, dice, homebrew monsters, backups with a second location and campaign export, web tabs. Packaged builds are unsigned on both platforms.

## Install

Download the build for your machine from the project's releases page.

- **Windows:** `Trifold-Setup-<version>-win-x64.exe` installs per user (no administrator rights) with Start menu and desktop shortcuts; `Trifold-Portable-<version>-win-x64.exe` runs without installing. The builds are not code-signed, so SmartScreen shows "Windows protected your PC" the first time: click **More info**, then **Run anyway**.
- **macOS:** open the `.dmg` and drag Trifold to Applications. The app is not notarised. On macOS 15 the first launch says the app could not be opened: open **System Settings → Privacy & Security**, scroll to the message about Trifold and click **Open Anyway**, then confirm. (Right-click → Open no longer bypasses this on recent macOS.) Pick the download that matches your Mac's chip.

On first launch Trifold creates its Library at `Documents/Trifold Library` (you can choose another folder in Settings). Everything you import or write lives there as plain files; see the [user guide](docs/USER-GUIDE.md).

## Development

Requires Node 22+ and pnpm (the repo pins `pnpm@12`; `corepack enable` or `npm i -g pnpm`).

```
pnpm i            # install (downloads a prebuilt better-sqlite3 for Electron)
pnpm dev          # console window with hot reload
pnpm test         # Vitest unit tests
pnpm typecheck    # tsc across every package
pnpm lint         # ESLint + Prettier check
pnpm smoke        # build, then a Playwright smoke test that drives the real app
pnpm build        # electron-builder → dist/ (Windows: NSIS installer + portable exe; macOS: dmg + zip)
pnpm fetch:content # download the SRD snapshot and the game-icons set into resources/; needs network
```

Run `pnpm fetch:content` once after cloning. It writes `resources/srd-2024.jsonl` and `srd-2014.jsonl` (git-ignored) from the Open5e API and refreshes the committed `resources/srd-manifest.json`. It also clones game-icons.net's icon set into `resources/icons/svg/` (git-ignored, needs `git` on PATH), writes `resources/icons/credits.json` for the About page, and checks every name in the committed `resources/icons/mapping.json` against the set (`pnpm verify:mapping`). Without them the app still runs; it has no bundled SRD until you import your own files, and tokens show initials instead of glyphs.

Local-only test content such as a full community compendium file must stay out of the repo: name it `*.local.xml` or put it under `fixtures/local/`, both of which are git-ignored.

Two things worth knowing:

- `pnpm i` finishes by running `scripts/rebuild-native.mjs`, which makes sure Electron's binary is downloaded and fetches the prebuilt `better-sqlite3` for the pinned Electron version. If Electron is missing or fails to load the index, run `pnpm rebuild:native`. The Electron and better-sqlite3 pins move together; see [ADR 0001](docs/adr/0001-electron-and-native-module-pins.md).
- Some editor and extension-host terminals export `ELECTRON_RUN_AS_NODE=1`, which makes Electron start as plain Node and refuse to open windows. `pnpm dev` (via `scripts/dev.mjs`) and the smoke test strip it automatically; the packaged exe does not, so unset it before launching that from such a terminal.
- To start dev mode without a terminal, double-click `Trifold.cmd` (Windows) or `Trifold.command` (macOS) in the repo root.
- `pnpm build` refuses to run until `pnpm fetch:content` has populated `resources/` (`scripts/check-content.mjs`), so an installer can never ship without the SRD. Build on the machine you target: each platform packages itself for its own architecture (ADR 0006). The steps are in [docs/RELEASING.md](docs/RELEASING.md).

## Content and licensing

The package ships only System Reference Document content (CC-BY 4.0), game-icons.net icons (CC BY 3.0) and this project's own text. Attribution is shown in the app. Anything you import stays in your Library and is never transmitted anywhere.
