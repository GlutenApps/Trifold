# ADR 0070 — The PC card's sheet link

**Status:** accepted, 2026-11-23. Part 3, phase 5 of `docs/PLAYER-MODE.md` ("Way 1: keep the sheet elsewhere").

## Context

The PC card had a `dndBeyondUrl` field that no form, importer or exporter read or wrote. A player who keeps their sheet in another app gives the table a link to it (ADR 0068), and the GM may keep one on the PC card too. The field named one site; ground rule 1 says nothing in the app names a site.

## Decision

- `PCCard.dndBeyondUrl` becomes `sheetUrl`: a web address (`http` or `https`) of at most 2,000 characters, or absent.
- PC files go from version 1 to 2 with their own constant, `PC_SCHEMA_VERSION`; every other campaign file stays at `CAMPAIGN_SCHEMA_VERSION` (1). The `pc` migration from 1 to 2 renames the field, and drops a value that is not a web address rather than keep something nothing could open. Campaign packages (`.trifold-campaign`) and backups run the same migration when read.
- The PC form gains **Character sheet link** under Basics; a value that is not a web address holds Save with a message. A PC row with a link has an **Open character sheet** button (the external-link icon) that opens it as a web tab (ADR 0011).

## Consequences

- PC files written by this version cannot be read by an older one, which expects version 1. Campaign packages say the same through their manifest's version check only for the campaign file, so an older Trifold skips the PCs of a newer package with a logged warning.
- Sheet updates (next) can carry a player's sheet link into this field.
