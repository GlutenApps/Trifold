# Releasing Trifold

This is how a commit on `main` becomes the installers people download. Pushing a version tag does most of the work: GitHub Actions builds every platform and drafts a release for you to review and publish.

## What a release contains

| Platform            | Files                                                                                            | Built on                |
| ------------------- | ------------------------------------------------------------------------------------------------ | ----------------------- |
| Windows x64         | `Trifold-Setup-<version>-win-x64.exe` (per-user installer), `Trifold-Portable-<version>-win-x64.exe`, `latest.yml` and `latest.yml.sig` (the signed update manifest) | `windows-latest`        |
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

On each of the three runners, `.github/workflows/release.yml` installs, fetches the SRD and icons (this step must succeed, so a release can never ship without content), checks them, runs the type checks and tests, and builds. On Windows it then signs the exes (a placeholder until SignPath is live, see Code signing) and runs `scripts/update-manifest.mjs`, which writes `latest.yml` from the final installer and signs it with the update key. The Windows build stops at the start if the `TRIFOLD_UPDATE_SIGNING_KEY` secret is missing. When all three finish, it creates a **draft** release on GitHub with every installer attached.

Then, on the draft:

- Check it's attached to the `vX.Y.Z` tag. The update check reads the version from the tag, and the Windows build downloads its update from the tag's `download/vX.Y.Z/` folder, so a release without its tag can't install itself.
- Write the notes for the people downloading it, starting from the changelog section.
- Tick **Set as a pre-release** for a test build (and tag it `vX.Y.Z-beta.N`).
- Publish.

The content fetch needs the Open5e API and the game-icons repository to be reachable. If either is down, the build fails rather than shipping an empty app; try again later.

## How updates reach people

The update check is off until the user turns it on. When it's on, Trifold reads the project's public releases list after every launch and once a day while it stays open, and when it finds a newer version it shows **Update available**. What happens next depends on the build:

- **Installed on Windows:** Trifold reads `latest.yml` and `latest.yml.sig` from the release's `download/vX.Y.Z/` folder, refuses the manifest unless one of the public keys in `apps/desktop/src/main/updateSignature.ts` verifies its signature, and downloads the installer in the background (electron-updater checks the installer against the manifest's sha512). The top bar then reads **Restart to update**, and **Restart now** in Settings › Updates saves, makes the on-close backup, runs the installer silently and reopens Trifold. It never restarts by itself.
- **Portable exe, Microsoft Store, macOS:** the download button opens the release page. A build whose `UPDATE_PUBLIC_KEYS` is empty does the same.

A failed check or download (offline, or GitHub asking it to wait) shows in Settings › Updates and is tried again after 5 minutes, 30 minutes and 2 hours, then daily.

The check only sees **published** releases, so a release reaches people the moment you publish its draft. Pre-releases only reach people already running a pre-release. The two addresses it uses are constants in `apps/desktop/src/main/updates.ts`; change them there if the repository moves. `electron-builder.yml` has `publish: null` on purpose, and `apps/desktop/build/app-update.yml` only names the updater's cache folder and, once code signing is live, the publisher.

### The update signing key

An Ed25519 key pair. The private half lives only in your password manager and the repository's Actions secret. Set it up once:

1. Run `node scripts/update-keygen.mjs`. It writes the private key to `~/trifold-update-signing-key.pem` (it refuses a path inside the repo) and prints the public key. Run it again with another path for a spare key.
2. Add both public keys to `UPDATE_PUBLIC_KEYS` in `apps/desktop/src/main/updateSignature.ts`, current key first, and commit. Only releases built after this commit can update themselves.
3. On GitHub, under **Settings › Secrets and variables › Actions**, add a repository secret named `TRIFOLD_UPDATE_SIGNING_KEY` whose value is the whole current-key `.pem` file, including the BEGIN and END lines.
4. Keep both `.pem` files in your password manager, the spare offline, and delete them from disk.

`scripts/update-manifest.mjs` refuses to sign with a key whose public half isn't in `UPDATE_PUBLIC_KEYS`, since every installed copy would refuse that update.

**If the key leaks or is lost:** put the spare's private key in the secret, and release a build whose `UPDATE_PUBLIC_KEYS` lists the spare first and a new spare second (drop the old key). Copies update to it with the spare's signature and trust only the new list from then on. If both private keys are lost, installed copies can't verify anything new, and everyone installs the next release by hand once.

### Testing an update from one version to the next

Use a Windows machine or VM that has never had Trifold installed, and a Library you don't mind losing. The test uses pre-release tags on the real repository, which only pre-release builds see.

1. **Version A.** With the keys set up, bump to `0.5.0-beta.1`, tag, and let the workflow finish. Check that the draft has `latest.yml` and `latest.yml.sig` beside the Setup exe, publish it as a **pre-release**, and install the Setup exe.
2. In A, answer **Turn on** to the update question (or switch it on in Settings › Updates). Settings says it's the newest version.
3. **Version B.** Bump to `0.5.0-beta.2`, add a visible change (a CHANGELOG line shows on About), tag, and publish it as a pre-release.
4. **Download.** Quit and reopen A. Within about ten seconds the top bar shows **Update available**. Settings › Updates shows the download's progress, then that 0.5.0-beta.2 is ready to install, and the top bar reads **Restart to update**.
5. **Nothing happens by itself.** Start a combat, change some HP and a note, and wait. Trifold must not restart. Clicking the top bar button only opens Settings.
6. **Restart now.** Trifold closes, the installer runs without a window, and Trifold reopens on 0.5.0-beta.2. About shows the new version, the combat and note edits are there, today's on-close backup is in Settings › Backups, and the Library's log shows `installing 0.5.0-beta.2 and restarting`.
7. **A bad signature is refused.** Make `0.5.0-beta.3` as a draft, download its `latest.yml`, change one character, upload it back over the original, and publish as a pre-release. Press Check now: Settings says the signature didn't verify, nothing installs, and **Download 0.5.0-beta.3** opens the release page. Delete that release.
8. **Offline.** Turn the network off and reopen Trifold: Settings › Updates says the computer is offline and nothing else appears. Turn the network back on: within five minutes, or on Check now, the check succeeds.
9. **Other builds.** Run beta.1's portable exe: it offers **Download** (the release page) and never downloads by itself.
10. **Clean up.** Delete the test releases and their tags (`git push origin :refs/tags/v0.5.0-beta.1` and so on).

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

A Windows certificate and an Apple Developer ID would remove the SmartScreen and Gatekeeper steps.

**Windows (SignPath, not live yet).** `release.yml` has a clearly marked **SIGNPATH PLACEHOLDER** step that is always skipped. Once the SignPath project is approved:

1. Add the `SIGNPATH_API_TOKEN` secret and replace the placeholder with the steps its comment lists: upload the unsigned exes, submit the signing request, and write the signed exes back into `dist/`. The update manifest step must stay after it, because signing changes the installer's hash.
2. In `apps/desktop/build/app-update.yml`, uncomment `publisherName` and set it to the certificate's subject name exactly as Windows shows it (the installer's Properties › Digital Signatures). From that release on, installed copies also refuse an installer that publisher didn't sign.
3. Remove the SmartScreen note from the README once the certificate's reputation builds up.

**macOS.** Set `mac.identity` with `hardenedRuntime: true` and notarisation in `electron-builder.yml`, and remove `CSC_IDENTITY_AUTO_DISCOVERY=false` from the workflow. In-app updates on macOS would need this first.
