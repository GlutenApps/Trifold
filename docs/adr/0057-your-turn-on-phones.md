# ADR 0057 — Your turn and you're next on a player's device

**Status:** accepted, 2026-11-22.

## Context

ADR 0046 settled that phones show only what the TV shows. The turn order reaches a phone as the TV's initiative strip, and only while the DM has that overlay on. With it off, a player at the table had no sign on their own device that their turn had come, and with it on, nothing said which entry was theirs: the strip's entries carry no link to a device's creatures.

Player mode (`docs/PLAYER-MODE.md`) puts the same view in a desktop console, where a strip that says "Your turn" is the obvious thing to have. The DM asked for players to be told when they are next as well.

## Decision

- Each creature in a device's view carries `turn`: `now` while its combatant is the active one in the loaded fight, `next` while it is the one Next turn would move to, otherwise absent.
- "Next" is the tracker's own rule (`upNextIndex` beside `advanceTurn` in `packages/rules`), so dead and held combatants are skipped and the two never disagree. There is no `next` before the first turn, since the order is not settled until the fight begins, or when one combatant is left.
- The console marks it in the snapshot; `viewFor` sends it only with the creatures a device holds, summons included.
- It does not follow the initiative strip overlay. This is the one thing a device learns about the turn order that the TV may not be showing, and it is only about that device's own creatures. The order itself, the round and everyone else's turn still follow the overlay, as ADR 0046 says.
- The phone page shows **Your turn** or **You're next** beside the character's name in its summary.

## Consequences

- "You're next" tells a player that the acting combatant is the one before them, and nothing about who or what it is. A hidden enemy acting just before a PC is not revealed.
- A paused fight tells nobody anything: only the loaded fight counts, as for initiative.
- The player console's strip reads the same field.
