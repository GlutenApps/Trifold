# Releasing Trifold

This is how a commit on `main` becomes the installers people download. Pushing a version tag does most of the work: GitHub Actions builds every platform and drafts a release for you to review and publish.

## What a release contains

| Platform            | Files                                                                                            | Built on                |
| ------------------- | ------------------------------------------------------------------------------------------------ | ----------------------- |
| Windows x64         | `Trifold-Setup-<version>-win-x64.exe` (per-user installer), `Trifold-Portable-<version>-win-x64.exe` | `windows-latest`        |
| macOS Apple Silicon | `Trifold-<version>-mac-arm64.dmg`, `Trifold-<version>-mac-arm64.zip`                             | `macos-latest`          |
| macOS Intel         | `Trifold-<version>-mac-x64.dmg`, `Trifold-<version>-mac-x64.zip`                                 | `macos-15-intel`        |

Each platform builds for its own architecture, because the SQLite module is fetched prebuilt for the machine doing the build. There's no universal macOS build.

Every package holds the app, the SRD snapshot and the icon set under `resources/`, and the font licences under `resources/licenses/`. The About page shows the attribution. The Windows installer shows the MIT licence from `apps/desktop/build/license.txt`, which is a copy of the root `LICENSE`; keep the two identical.

The builds aren't code-signed on either platform yet. The README explains how to get past SmartScreen and Gatekeeper.

## Before tagging

1. **Checks pass.** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm smoke` pass locally, and CI is green on `main` for both platforms. Go by the exit codes rather than the output, since Prettier prints warnings even when it passes.
2. **Changelog.** Move the `[Unreleased]` section of `CHANGELOG.md` under the new version with today's date.
3. **Version.** Set `version` in `apps/desktop/package.json` (the app and the installer read this one) and keep the root `package.json` in step. The release workflow refuses a tag that doesn't match.
4. **Docs.** The README's install section and the user guide still match the build: file names and first-launch steps.
5. **Sample campaign maps.** They're CC BY-NC 4.0, so a free release can include them. Before 1.0, or any release that's sold or sits behind a payment, replace them with openly licensed maps or get 2-Minute Tabletop's written permission.
6. **Commit** as `chore(release): vX.Y.Z`.

## Tag and build

```
git tag vX.Y.Z
git push origin main vX.Y.Z
```

On each of the three runners, `.github/workflows/release.yml` installs, fetches the SRD and icons (this step must succeed, so a release can never ship without content), checks them, runs the type checks and tests, and builds. When all three finish, it creates a **draft** release on GitHub with every installer attached.

Then, on the draft:

- Check it's attached to the `vX.Y.Z` tag. The update check reads the version from the tag, so a release without one is invisible to it.
- Write the notes for the people downloading it, starting from the changelog section.
- Tick **Set as a pre-release** for a test build (and tag it `vX.Y.Z-beta.N`).
- Publish.

The content fetch needs the Open5e API and the game-icons repository to be reachable. If either is down, the build fails rather than shipping an empty app; try again later.

## How updates reach people

The update check is off until the user turns it on. When it's on, Trifold reads the project's public releases list at most once a day, and when it finds a newer version it shows **Update available**. The download button opens the release page; the app never downloads or installs anything itself.

The check only sees **published** releases, so a release reaches people the moment you publish its draft. Pre-releases only reach people already running a pre-release. The two addresses it uses are constants in `apps/desktop/src/main/updates.ts`; change them there if the repository moves.

## Building by hand

The same steps work on your own machine, which is also how to try an installer before tagging:

```
pnpm i
pnpm fetch:content      # once per clone, or when the manifests change
pnpm build              # checks the content first, then writes dist/
```

On Windows this gives you `dist/Trifold-Setup-…exe`, `dist/Trifold-Portable-…exe` and `dist/win-unpacked/`. On macOS you get the `.dmg`, the zip and `dist/mac-arm64/` (or `dist/mac/` on Intel). `pnpm build` targets the machine it runs on, so build the Intel Mac version on an Intel Mac or let the workflow do it.

Run the smoke test against the packaged app before trusting it:

```
# Windows (PowerShell)
$env:TRIFOLD_SMOKE_EXE = "$PWD\dist\win-unpacked\Trifold.exe"
cd apps\desktop; pnpm exec playwright test -c smoke/playwright.config.ts

# macOS
TRIFOLD_SMOKE_EXE="$PWD/dist/mac-arm64/Trifold.app/Contents/MacOS/Trifold" \
  pnpm --filter @trifold/desktop exec playwright test -c smoke/playwright.config.ts
```

If your terminal sets `ELECTRON_RUN_AS_NODE=1` (some editor terminals do), the packaged app starts as plain Node and shows nothing. Clear it first.

## What to check on a clean machine

- **Windows installer:** after the SmartScreen prompt, it installs under `%LOCALAPPDATA%\Programs\Trifold` with Start menu and desktop shortcuts. Uninstalling leaves the Library alone.
- **Windows portable:** the first launch unpacks into `%TEMP%\Trifold`, and later launches are quick.
- **macOS:** the dmg opens, the app copies to Applications, the first launch goes through Privacy & Security → Open Anyway, and the second launch opens normally.
- **First launch:** Trifold creates `Documents/Trifold Library`. About shows the version, both SRD attributions and the game-icons credits. The compendium lists SRD monsters, and the player window opens on a second display.
- **Logs:** if something fails before a Library is open, it's logged in the app's own folder, `%APPDATA%\Trifold\logs` or `~/Library/Application Support/Trifold/logs`.

## Code signing

A Windows certificate and an Apple Developer ID would remove the SmartScreen and Gatekeeper steps. Once you have them, set `win.certificateFile` (or `CSC_LINK`) and `mac.identity` with `hardenedRuntime: true` and notarisation in `electron-builder.yml`, and remove `CSC_IDENTITY_AUTO_DISCOVERY=false` from the workflow.
