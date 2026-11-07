# Releasing Trifold

How a commit on `main` becomes the installers people download. Builds are unsigned on both platforms (code signing and notarisation are M3, `DESIGN.md` §10); the README tells users how to get past SmartScreen and Gatekeeper.

## What a release contains

| Platform            | Files                                                                                     | Made by                       |
| ------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- |
| Windows x64         | `Trifold-Setup-<version>-win-x64.exe` (NSIS, per-user), `Trifold-Portable-<version>-win-x64.exe` | `windows-latest` runner       |
| macOS Apple Silicon | `Trifold-<version>-mac-arm64.dmg`, `Trifold-<version>-mac-arm64.zip`                       | `macos-latest` runner         |
| macOS Intel         | `Trifold-<version>-mac-x64.dmg`, `Trifold-<version>-mac-x64.zip`                           | `macos-15-intel` runner       |

Each platform packages itself for its own architecture (ADR 0006): `scripts/rebuild-native.mjs` fetches the prebuilt `better-sqlite3` for the host, so a universal macOS binary is not attempted. The `.blockmap` and `builder-debug.yml` that electron-builder also writes are not part of a release.

Inside every package: the app, the SRD snapshot and game-icons set under `resources/`, the icon licence, and the font licences under `resources/licenses/`. Attribution is shown on the About page.

## Before tagging

1. **Green checks.** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm smoke` pass locally, and CI is green on `main` for both platforms. Check exit codes, not output.
2. **Changelog.** Move the `[Unreleased]` section of `CHANGELOG.md` under the new version with today's date.
3. **Version.** Set `version` in `apps/desktop/package.json` (the one electron-builder and `app.getVersion()` read) and keep the root `package.json` in step. The release workflow refuses a tag that does not match.
4. **Docs.** `README.md` install section and `docs/USER-GUIDE.md` still describe the build (file names, first-launch steps).
5. Commit: `chore(release): v0.3.0`.

## Tag and build

```
git tag v0.3.0
git push origin main v0.3.0
```

`.github/workflows/release.yml` then, on each of the three runners: installs, runs `pnpm fetch:content` (the SRD snapshot and icons are git-ignored, so every build fetches them; here the step is not allowed to fail), `pnpm check:content`, typecheck, tests, and `pnpm build -- --publish never`. The artifacts are uploaded and a **draft** GitHub release is created with all of them attached. Review the draft, paste the changelog section into its notes, and publish.

`pnpm fetch:content` depends on the Open5e API and the game-icons repository being reachable. If either is down the build fails rather than shipping without content; retry later.

## Building by hand

The same steps work on a developer machine, which is also how to test an installer before tagging:

```
pnpm i
pnpm fetch:content      # once per clone, or after the manifests change
pnpm make:icon          # only if docs/design-brief/logo.svg changed
pnpm build              # runs check:content first; writes dist/
```

On Windows this leaves `dist/Trifold-Setup-…exe`, `dist/Trifold-Portable-…exe` and `dist/win-unpacked/`. On macOS, `dist/Trifold-…dmg`, the zip and `dist/mac-arm64/` (or `mac/` on Intel). `pnpm build` packages for the machine it runs on; build Intel macOS on an Intel Mac or let the workflow do it.

Run the smoke test against the packaged app before trusting it:

```
# Windows (PowerShell)
$env:TRIFOLD_SMOKE_EXE = "$PWD\dist\win-unpacked\Trifold.exe"
cd apps\desktop; pnpm exec playwright test -c smoke/playwright.config.ts

# macOS
TRIFOLD_SMOKE_EXE="$PWD/dist/mac-arm64/Trifold.app/Contents/MacOS/Trifold" \
  pnpm --filter @trifold/desktop exec playwright test -c smoke/playwright.config.ts
```

If a terminal exports `ELECTRON_RUN_AS_NODE=1` (some editor terminals do), the packaged exe starts as plain Node and shows nothing; unset it first.

## What to check on a clean machine

- Installer: SmartScreen prompt, then installs under `%LOCALAPPDATA%\Programs\Trifold` with Start menu and desktop shortcuts; the uninstaller leaves the Library alone.
- Portable: first launch unpacks into `%TEMP%\Trifold`; later launches are fast.
- macOS: the dmg opens, the app copies to Applications, the first launch goes through Privacy & Security → Open Anyway, and the second launch is silent.
- First launch creates `Documents/Trifold Library`, About shows the version and both SRD attributions plus the game-icons credits, the compendium lists SRD monsters, and the player window opens on a second display.
- A failure before the Library opens is logged under the app's `userData/logs/` (`%APPDATA%\Trifold\logs` or `~/Library/Application Support/Trifold/logs`).

## Not yet

- **Code signing.** A Windows certificate and an Apple Developer ID would remove the SmartScreen and Gatekeeper steps. When they exist: set `win.certificateFile`/`CSC_LINK` and `mac.identity` with `hardenedRuntime: true` and notarisation in `electron-builder.yml`, and drop `CSC_IDENTITY_AUTO_DISCOVERY=false` from the workflow.
- **Update check.** The settings schema reserves `checkForUpdates`, nothing implements it, and electron-builder has no `publish` configuration on purpose. If it is ever built it must stay opt-in (CLAUDE.md ground rule 1).
- **Project licence.** There is no `LICENSE` file yet, so the installer shows no licence page. Add one at the repo root (and `build/license.txt` for the NSIS page) once the licence is chosen.
