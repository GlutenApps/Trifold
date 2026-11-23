# ADR 0072 — New PC from player sheet

**Status:** accepted, 2026-11-23. Completes Part 3, phase 5 of `docs/PLAYER-MODE.md` ("Sheet updates": New PC from player sheet).

## Context

Sheet updates (ADR 0071) change the PC card a player holds. A player whose character the GM has not made a card for yet holds nothing: the picker offers only the cards there are. The plan has the GM create a card from the player's offered sheet.

## Decision

- **The player.** In the player console's VTT tab, while holding nothing and with a character linked to the campaign, the picker has **Ask your GM to add <name>** under it. It sends `sheetOffer` without a `creatureId`, with the linked character's name, table numbers and sheet link, and the player's name at the table as `label`. The picker shows that the GM has been asked, with Cancel, as for an approval.
- **The table server** refuses it from a device that holds something, and holds it with the asking browser. It always waits for the GM, whatever **Accept sheet updates automatically** says: a new card is the GM's to make. Cancel, or the browser leaving, drops it.
- **The GM.** Player devices lists "<player> asks to add <name> as a new PC" with the class line, AC and HP, and **Add PC** or **Dismiss**, under the same waiting dot.
- **Add PC** sends `tableSheet` with no PC to the console, which makes the card from the offer (the console stays the only writer of PC files) and hands its id back with `table.grantNewPc(requestId, pcId)`. The hub claims the new card for the asking device, as an approval does, and answers `sheetAnswer {accepted: true}`; the same numbers offered next for that card are answered at once. **Dismiss** tells the player the GM did not add the character.

## Consequences

- A player can arrive with a character made at home and be at the table on it without the GM typing anything.
- The new card has no token: the GM places it as for any PC.
