# ADR 0076 — Version check between Trifolds at a table

**Status:** accepted, 2026-11-23. Item 8 of the schedule to release in `docs/PLAYER-MODE.md`, added to Part 3 by Ian on 2026-11-23.

## Context

A player's Trifold and the GM's are installed and updated separately. Phones always get the page the GM's Trifold serves, so they match it; a player's Trifold may not. Until now nothing compared the two, so a table whose messages had changed would fail in ways neither side could explain.

## Decision

- **One protocol number**, `TABLE_PROTOCOL` in `packages/rules/src/table/version.ts`, starting at 1. It goes up when a message changes in a way the other side cannot read: a field renamed or removed, or a meaning changed. An added optional field (such as ADR 0075's `for`) does not move it.
- **The table says its protocol and app version**:
  - in its first message (`campaign` gains `protocol` and `appVersion`);
  - in its network advertisement (TXT keys `p` and `app`).
- **Ian's choice: block only if incompatible.**
  - A player's Trifold on another protocol does not join. It sends nothing (no `hello`), closes, and says which side has to update. The link states are `gmUpdate` ("Your GM's Trifold needs an update before you can play") and `playerUpdate` ("Update Trifold to play at your GM's table"). It looks again every 30 seconds.
  - A table that sends no protocol is older than this check, so the GM has to update.
  - The same protocol on another app version plays. The player strip notes "· GM on 0.7.0", with a tooltip suggesting an update.
- **Join a campaign** tells before anything connects. A table found by the search or at a typed address that needs an update shows "This table runs a newer Trifold (0.7.0). Update yours to join." (or "… older …. Your GM needs to update it …") in place of Join.
- App versions are kept only when short and printable (`cleanAppVersion`).

## Consequences

- From this release on, a player whose Trifold is too old or too new is told what to do, before joining and at the table.
- A player's Trifold from before this release does not check. The GM's table cannot tell it from a phone, so the first release with the check is the baseline.
- Raising `TABLE_PROTOCOL` is a decision made with the message change, and is noted in that change's ADR.
