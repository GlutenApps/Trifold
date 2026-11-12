# ADR 0031 · The roll log reads oldest first, and rolls can be pinned

**Status:** accepted, 2026-11-12. Refines `DESIGN.md` §6.7 and ADR 0009 (the Dice pop-up).

## Context

The Dice pop-up showed the last roll twice: as a large result under the Roll button and again at
the top of the log, which listed newest first. The roll reveal replayed every time the pop-up
opened, so opening it looked like a re-roll. A roll worth keeping (rolled stats, a pre-rolled
initiative, a treasure roll) was lost when the log cleared or the app restarted.

## Decision

- **One place for a roll.** The result under Roll is gone. The log lists oldest first, with the
  newest roll at the bottom, marked and carrying the reveal; the header says "newest at the
  bottom". The log scrolls on its own inside the pop-up, opens at its end and follows each new
  roll down, unless the DM has scrolled up to read. The tray's last total stays.
- **The reveal plays once.** Only a roll made within the reveal's time tumbles; anything older
  shows settled, wherever it is drawn (the pop-up, the tray, a stat block's last roll).
- **The log itself is unchanged:** memory only, up to 500 rolls, cleared by the trash button or a
  restart.
- **Pinned rolls.** Each log row has a pin action (quiet until the row is in use, ADR 0020).
  Pinning saves the result and a record of what was rolled (label, expression, total, faces,
  source, actor, crit or fumble, when it was rolled) to the open campaign and opens its name,
  which starts as the roll's label. Pins sit in a **Pinned** list above the log, in the order
  they were pinned, with rename (pencil) and unpin (the lit pin, then the inline confirm with
  verb Unpin). Clearing the log leaves them. Pinning needs an open campaign.
- **Storage:** one file per pin, `campaigns/<slug>/pinnedRolls/<id>.json` (file kind
  `pinnedRoll`, version 1), so backups, campaign export and import, and migrations treat it like
  any other object. A fresh-start export leaves pins out, as results of play.

## Consequences

The Pinned list keeps to about a third of the pop-up and scrolls past that, so the newest roll
in the log stays in view.
