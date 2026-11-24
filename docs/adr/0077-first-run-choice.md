# ADR 0077 — First-run choice: Game master or Player

**Status:** accepted, 2026-11-23. Item 9 of the schedule to release in `docs/PLAYER-MODE.md`, added to Part 3 by Ian on 2026-11-23.

## Context

Every new Library opened as a DM's: it got the bundled sample campaign (ADR 0016), and Library › Campaigns led with Create campaign. Someone installing Trifold only to play at a friend's table landed in a GM's Library with an adventure they would never run.

## Decision

- **A new Library asks once**, while player mode is on: "How will you use Trifold?", with **Game master** and **Player** (Ian chose the wording).
  - The question replaces the Library page until it is answered; the Library's navigation stays.
  - "New" means never asked, no sample added and no campaigns (`waitsForRole`). Existing Libraries, and every Library while player mode is off, work exactly as before.
- **The answer is kept in the Library**: `role` in `library.json`, `gm`, `player` or null (never asked, which works as a game master's). It is additive with a default, so there is no schema bump.
- **Game master:** main adds the sample campaign then, as it would have at open. The Library continues as today.
- **Player:**
  - No sample campaign.
  - The Library opens on Campaigns with Join a campaign already open.
  - On that page Join a campaign is the primary button and Create campaign the plain one.
  - Characters is beside Campaigns in the Library's navigation, as before.
- **Settings › Appearance › How you use Trifold** changes it later. A change there adds and removes nothing; Settings › Sample campaign still adds the sample.
- Main holds the sample back while a new Library waits: `LibraryInfo.needsRole`, and `library.setRole(role)`, which seeds the sample for a game master's first answer.

## Consequences

- A player's first minutes are joining a table and making a character, not closing a sample adventure.
- When player mode's flag comes off, every new Library asks; a GM answers once.
