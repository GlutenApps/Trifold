# ADR 0056 · Trifold is licensed under the GPL, version 3 or later

**Status:** accepted, 2026-11-21. Replaces the MIT licence chosen for v0.3.0.

## Context

Trifold shipped v0.3.0 to v0.4.5 under the MIT License. On 2026-11-17 the owner chose to open the
project to other users and contributors while keeping the option to offer other licences later,
and to keep the name and logo for the official app. Two questions held the switch: who holds the
copyright, and whether an employer has a claim. On 2026-11-21 the owner answered: the copyright is
Ian duPont's, and no employer has a claim.

## Decision

1. **The code is GPL-3.0-or-later**, copyright © 2026 Ian duPont, from the next release (0.4.6).
   `LICENSE` is the GNU GPL v3 word for word; both `package.json` files say `GPL-3.0-or-later`.
2. **The installer and the app show it.** The Windows installer's licence page is a short
   copyright and GPL notice, with the bundled content's own licences named, followed by the full
   text (`apps/desktop/build/license.txt`). Settings › About shows the same notice, including
   that there is no warranty, with the full text folded under it, as the GPL asks of an
   interactive program.
3. **Earlier releases stay MIT.** A licence already given cannot be taken back: copies of v0.3.0
   to v0.4.5, and the source as it was then, remain under MIT for whoever has them. The notices
   say so. The git history is not rewritten.
4. **Contributors sign a CLA** (CLA Assistant on the repository), so the owner can offer other
   licences later. `CONTRIBUTING.md` explains it.
5. **The name and logo are not licensed.** `TRADEMARK.md` reserves them and says what others
   may do without asking: say a project is based on Trifold, refer to it, share unchanged
   releases.
6. **Bundled content keeps its own licences**: SRD text (CC BY 4.0), game-icons.net icons
   (CC BY 3.0), the fonts (SIL OFL 1.1) and the sample campaign's maps (CC BY-NC 4.0, until they
   are replaced before 1.0).

## Consequences

- Anyone may use, change and share Trifold, but a version they distribute must stay GPL with its
  source available, and may not be called Trifold.
- The libraries Trifold bundles (MIT, ISC, BSD, Apache, BlueOak, Python-2.0) are GPL-compatible.
  Their licence texts ship with the app in `resources/licenses/THIRD_PARTY_NOTICES.txt`, generated
  at build time from what the bundles actually contain (`apps/desktop/licenseCollector.ts`) and
  the main process's runtime dependencies (`scripts/third-party-notices.mjs`); Settings › About
  shows it under **Open-source libraries Trifold uses**.
- The CLA bot must be set up on the GitHub repository by its owner before outside pull requests
  are merged.
