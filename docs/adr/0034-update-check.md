# ADR 0034 · An opt-in check for app updates

**Status:** accepted, 2026-11-14. Builds `DESIGN.md` §10 Beta 2; amends `CLAUDE.md` ground rule 1
and settles the open point in ADR 0029's consequences.

## Context

Testers install from GitHub releases now and from itch.io in the beta. Neither updates itself
outside the itch app, so a tester only learns of a fix by being told. `library.json` reserved
`checkForUpdates` from the start and ground rule 1 allowed a user-enabled check, but the same rule
says nothing in the repo or the UI names a site, and an update check has to ask somewhere.

## Decision

- **What it asks.** The project's public GitHub releases list, read anonymously. The request
  carries a `User-Agent` of `Trifold/<version>` (the host requires one) and nothing else: no
  identifier, no Library or campaign data. Drafts are never visible to it; pre-releases count only
  when the running build is itself a pre-release.
- **Where the address lives.** Two constants in `apps/desktop/src/main/updates.ts`
  (`RELEASES_API`, `RELEASES_PAGE`) and `docs/RELEASING.md`. They are the only place the repo names
  the release host; UI copy says "the public release list". A release page outside
  `RELEASES_PAGE` is never opened, whatever the list answers.
- **Off until the DM says so.** The Library's Campaigns page asks once ("Check for new versions of
  Trifold?", **Turn on** or **No thanks**); either answer hides the question for good. Settings ›
  Updates has the switch at any time and a **Check now** button that works whether the switch is
  on or off.
- **When.** With the switch on, at most once a day, ten seconds after launch, and once when it is
  turned on if a day has passed. Nothing runs during a session otherwise. A failed check keeps the
  last good answer and shows why in Settings; the next launch tries again.
- **What it does with the answer.** Nothing but tell the DM: a quiet **Update available** button
  in the top bar (Library and console) opens Settings › Updates, where **Download** opens the
  release page in the browser and **Not now** hides the button until a newer version is out. The
  app never downloads or installs anything, and electron-builder keeps no `publish` configuration.
- **Where the state lives.** `config.json` (`AppConfig.updates`): the switch, whether the question
  was answered, the last check, what it found, the dismissed version and the last error. It is the
  computer's choice, not a Library's; `LibrarySettings.checkForUpdates` stays in the schema unread
  so existing files parse unchanged.

## Consequences

- Ground rule 1 now names two network uses the DM starts: web tabs (ADR 0011) and, once switched
  on, this check. Everything else stays local.
- Testers who downloaded from itch.io in a browser are sent to the GitHub release page too; the
  itch app updates its own installs.
- Nothing is found until a release is published (not a draft) on GitHub, so the release workflow
  must end with publishing the draft, as `docs/RELEASING.md` already says.
- Asking the host reveals the DM's IP address to it, as any web request does. The question and
  the Settings text say what the request carries (the version number, never their games) rather
  than promising that nothing about the DM leaves the computer.
