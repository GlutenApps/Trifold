# ADR 0079 — Every launch starts on the Library, and a console that fails says so

**Status:** accepted, 2026-11-24. Ian's call, after a beta tester's Trifold stopped opening.

## Context

A tester updated from 0.4.6 to 0.5.0-beta.1. The first launch worked; in it he imported a campaign and a compendium file, deleted the campaign and imported it again. Every launch after that showed the loading splash forever. Closing the splash left Trifold running in the background, and launches after that showed nothing at all.

His log showed the main process finished starting on every one of those launches (the Library opened, the index was ready and the update check ran on time). The console window was made and its page never painted. Three things turned that into an app that would not open:

- The splash closed only when the console was ready to show, or when startup threw. A page that never painted kept it up for good.
- The console window, made hidden, never showed, so closing the splash left a window and Trifold kept running. Nothing about the page (a crash, a failed load, a hang, an error while drawing) reached the log.
- The running copy held the single-instance lock, so each new launch handed over to it and quit; the running copy only focused its hidden console, which showed nothing.

Trifold also reopened the last open campaign at every launch. A campaign whose content breaks the console therefore broke every launch, with no way in to fix it.

## Decision

- **Every launch starts on Library › Campaigns.** Main no longer reopens the last campaign: `campaigns.current()` is the campaign opened in this run, or null. `lastOpenCampaignSlug` in `library.json` is no longer written or read; the field stays in the schema so files that carry it parse as before. Opening a campaign still restores its console as it was left (its saved layout), and opening another Library also starts on its Campaigns page. Joined campaigns already started closed.
- **A console page that fails is logged and handled** (`consoleHealth.ts`, `WindowManager.watchConsole`):
  - Its process stopping is logged with the reason; the page is reloaded once. If it stops again within a minute, the window shows a page that says it stopped working and where the log is, instead of reloading again.
  - A page that fails to load gets the same page at once.
  - A page that does not paint within 30 s of the window being made, or stops responding before it shows, is logged and the window is shown anyway: a window on screen is one the DM can close.
  - Errors the page writes to its console before it first shows go to the log (at most 20).
- **The renderer catches what the panels do not.** `WindowBoundary` wraps each window: an error while the shell itself draws shows "Trifold hit a problem and stopped drawing this window" with Reload and Open logs folder, and is logged. The TV shows nothing (never an error to the players) and still logs. Errors nothing caught (in handlers, unawaited promises) are logged too, at most ten per page load.
- **Trifold can always quit, and a second launch always finds it:**
  - `window-all-closed`, `second-instance` and the early `before-quit` flag are registered before startup waits on anything.
  - Opening Trifold while it runs shows the console even when it is hidden or has not painted yet.
  - Closing the splash before the console is ready quits, through the usual close flow when the console exists.
  - A startup that throws closes the splash, logs the error, says so in a message box with the log folder, and exits.

## Consequences

- A DM who finished a session inside a campaign opens it again from Campaigns at the next launch: one more click, in exchange for a launch that a single campaign cannot break.
- A console that fails is now visible and closable, and its failure is in the log a tester can send.
- The splash's time limit only starts once the console window exists; a slow Library open still shows "Opening your Library…" for as long as it takes.
