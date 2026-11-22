# ADR 0059 — Table rolls are made on the GM's machine

**Status:** accepted, 2026-11-23.

## Context

ADR 0004 gave Trifold one roll log, in memory, for the person at the computer. Player mode (`docs/PLAYER-MODE.md`) puts a Dice pop-up in each player's own Trifold, and a table wants two kinds of roll from it: one everyone sees, and one that is the player's own business.

A roll everyone sees has to be believed. Trifold is open source, so a roll made on a player's machine and then announced as public could be made up by anyone who changed their copy. The DM asked for both kinds, with public rolls made on the GM's machine and shown in the roll log (Ian, 2026-11-22).

## Decision

- A player's Dice pop-up has a switch, **Table** (the default) or **Private**. The strip's pool follows it and shows which is on.
- **Table:** the player's Trifold sends only the expression, in the roller's own syntax (`2d6+3`, `4d6kh3`, `d20+5 adv`). The GM's table server makes the roll with the same dice code as every other roll (`rollForTable` in `packages/rules`), names it for the character the player holds, and sends the result to the GM's roll log and to every device at the table that holds a creature, the roller's included. The roller's own log shows the roll only when it comes back.
- **Private:** rolled on the player's machine and never sent.
- Away from the table, or holding no character, there is nobody to ask: every roll is private and the switch says so.
- The server checks a roll like any other request: the device must hold a creature, the expression must parse, and it is held to 60 characters and 100 dice. The connection's message limit applies.
- Nothing is kept. The view carries no roll history, so a device that connects late sees rolls from then on. Table rolls go to the roll logs only: not the session log (ADR 0040), which is a recap, and not the TV.
- A table roll in a roll log has the source `table` and the roller's character as its actor. Pinned, it keeps that source; `PinnedRoll.source` gains the value, with no version bump.

New messages: `roll {expression}` from a device and `rolled {roll}` from the server. Main tells the GM's console with a `tableRoll` event.

## Consequences

- A public roll is as trustworthy as the GM's own copy of Trifold, which is the copy the table already trusts.
- The GM's rolls are unchanged and stay the GM's own. A GM roll shown to players is not part of this.
- Rolls a player makes from a stat block in their compendium are private for now; only the Dice pop-up and the strip's pool ask the table.
- The phone page ignores `rolled` and cannot ask for a roll; it has no roll log.
- A Library file written with a pinned table roll will not read in a Trifold older than this change, which skips that one pin.

## Left for later

A dedicated place in both consoles to show table rolls, a GM-only setting, rolls from the phone page, and GM rolls shown to the table (`docs/PLAYER-MODE.md`, "Table rolls").
