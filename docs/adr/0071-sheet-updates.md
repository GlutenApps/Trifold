# ADR 0071 — Sheet updates

**Status:** accepted, 2026-11-23. Part 3, phase 5 of `docs/PLAYER-MODE.md` ("Sheet updates"); follows ADRs 0068 to 0070.

## Context

The player owns the character sheet; the GM's PC card takes its table numbers, and the GM's console stays the only writer of PC files (PLAYER-CONNECTOR.md, Stored data). A level-up at home should reach the table when the player next sits down, with the GM agreeing to it.

## Decision

**What is offered.** A `SheetOffer` is the linked character's name, its table numbers (`tableNumbers`, ADR 0068) and its sheet link. The client message `sheetOffer {creatureId, offer}` follows the existing naming and is checked by the hub like an intent: the device holds that PC, the name is 1 to 80 characters, every number is in the `TableNumbers` ranges, the link is a web address; the 16 KiB cap applies as to every message.

**When the player's Trifold offers.** Main (`JoinedService`) offers while connected and holding a PC, when the PC held changes (the first view after connecting included), when the linked character is saved, and when a character is linked. It sends only numbers that differ from the last the GM answered and from any still waiting. `joined.json` keeps the last answered offer (`sheetAnswered`), so the same numbers are never offered twice, across restarts too. An offer still unanswered when the link drops is offered again at the next connection.

**The GM.** The hub holds one waiting offer per PC, in memory. The Player devices pop-up lists each under the approvals: "Sam offers new numbers for Brannoc Hale", then what would change on the card ("Level 4 → 5 · Max HP 31 → 38 · A new character sheet link"), with **Accept** and **Dismiss**. Waiting offers put the same dot on the Player devices button, the VTT tab and the strip's VTT section as other requests. The hub remembers each answer for the session, so an offer sent again (after a reconnect) is answered at once.

**Accept** sends `tableSheet` to the console, which writes the PC card through its store: name, class line, level, max HP, AC, initiative, speed, passives, saves, spell save DC and the sheet link. Current HP is held under a lower maximum; conditions and temp HP are left alone. A PC in a fight also gets the new max HP and AC on its combatant. The device hears `sheetAnswer {accepted}` either way, and My characters says "Your GM took its numbers" or "Your GM kept the numbers they have".

**Accept sheet updates automatically**, in Player devices, is saved in `players.json` (`sheets.autoAccept`, off by default) beside the reclaim mode and the summoning mode. With it on, an offer is written at once and never waits.

## Consequences

- A player can level up anywhere and the GM sees exactly what changed before it reaches the card.
- The name travels too: the first offer after linking renames the card to the character's name unless the GM dismisses it.
- **New PC from player sheet** (a card made from the offer of a player who holds nothing) is left for later.
