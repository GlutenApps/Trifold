# ADR 0045 · In-app updates on Windows, with a signed manifest

**Status:** accepted, 2026-11-19. Amends ADR 0034 and `CLAUDE.md` ground rule 1.

## Context

ADR 0034 added an opt-in check that only ever opened the release page. Testers on Windows then
downloaded the new installer by hand and ran it, and many stayed on old builds. Trifold is going
open source, and installers will soon be code-signed through SignPath, so Windows can update
itself the way most desktop apps do: download in the background and install on restart.

An updater that downloads and runs code is a bigger target than a check that opens a web page.
electron-updater verifies the installer's sha512 against `latest.yml`, and on Windows its
Authenticode signature against a publisher name, but nothing protects `latest.yml` itself: anyone
able to change the release's files could change both the installer and its hash. Code signing
also is not live yet, so the publisher check cannot be relied on today.

## Decision

- **Still opt-in.** The same switch, question and Settings card as ADR 0034. Nothing about
  updates happens until the DM turns it on.
- **When.** With the switch on: a few seconds after every launch, and once a day while Trifold
  stays open (was: at most once a day). **Check now** works whether the switch is on or off. A
  failed automatic check or download is quiet: its reason shows in Settings › Updates, and it is
  tried again after 5 minutes, 30 minutes and 2 hours, then daily.
- **Which builds install.** Only the installed (NSIS) Windows build. The portable exe has nowhere
  to install to, a Microsoft Store build (`process.windowsStore`) updates through the Store, and
  macOS keeps the release page until it is notarized. Those builds behave exactly as in ADR 0034.
  A build with no update public key also falls back to the release page.
- **How.** The releases list check is unchanged and decides whether a newer version exists. The
  installed build then hands that version to electron-updater (`NsisUpdater`, pinned) through a
  custom provider, `SignedManifestProvider`, which reads `latest.yml` and `latest.yml.sig` from
  that release's download folder under the existing `RELEASES_PAGE`. No new address is named.
- **Signed manifest.** CI writes `latest.yml` from the final installer (after code signing, which
  changes its hash) and signs its exact bytes with an Ed25519 private key held only in the GitHub
  Actions secret `TRIFOLD_UPDATE_SIGNING_KEY`. The app embeds the public keys
  (`UPDATE_PUBLIC_KEYS` in `updateSignature.ts`, the current key and a spare) and refuses a
  manifest that is missing, unsigned, signed by any other key, for a different version than the
  check found, or pointing at files outside its release. The manifest carries the installer's
  sha512, so a verified manifest pins the installer too. The signing script refuses to sign with
  a key the app does not list.
- **Authenticode.** Once SignPath is live, `publisherName` goes into
  `apps/desktop/build/app-update.yml` and electron-updater also refuses an installer not signed by
  that publisher. Until then that line stays commented out and the manifest signature carries the
  check alone.
- **Download, then ask.** A found update downloads in the background with its progress in
  Settings › Updates. When it is ready, the top bar's button reads **Restart to update** and opens
  the card, where **Restart now** does the install. The top bar never installs on its own click,
  so a stray click mid-session cannot close the app, and there is no dialog during combat.
- **Never without asking.** electron-updater's automatic download-and-install-on-quit is off;
  only **Restart now** installs. It runs the console's usual close flow first (flush the
  renderer's saves, save the window, the on-close backup), then starts the installer silently
  with relaunch, and quits. If the installer does not start, the console comes back.
- **Nothing about the DM.** electron-updater sends a random per-install ID header with manifest
  requests; the provider drops it. Requests carry the app's name and version only.
- **Differential downloads off.** The manifest is rewritten after signing, so no blockmaps are
  published; each update downloads the full installer (about the size of a fresh install).
- **No publish block.** `electron-builder.yml` sets `publish: null` so it neither infers a GitHub
  target from the git remote nor writes its own `app-update.yml`. `release.yml` uploads
  `latest.yml` and `latest.yml.sig` with the installers to the draft release.

## Consequences

- Ground rule 1's update check now downloads and runs an installer, on Windows, once the DM has
  turned it on and chosen to restart. The rule's text says so.
- A release cannot be made without the signing secret: the workflow stops early when it is
  missing, since every installed copy would refuse an unsigned update.
- Losing the private key means installed copies cannot verify a new key. Keep the spare key's
  private half offline; a release signed with the spare can then ship a new key list. If both are
  lost, testers must download one installer by hand.
- Releases made before this ADR (v0.4.1 and older) cannot install updates themselves; their check
  still opens the release page. The first release with a key in `UPDATE_PUBLIC_KEYS` is the first
  that can update in place.
- Pre-releases update only builds that are already pre-releases (ADR 0034), so a `-beta.N` tag is
  the way to test the updater on real installs before a stable release.
