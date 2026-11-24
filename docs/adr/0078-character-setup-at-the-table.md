# ADR 0078 — Setting up a character at the table, and the GM's copy of the sheet

**Status:** accepted, 2026-11-24. Found in the 0.5.0-beta.1 table test; follows ADRs 0068 to 0072.

## Context

A player who joined a campaign and picked a PC got a PC with no sheet. Linking a character, sending its numbers to the GM (ADR 0071) and asking for a new PC (ADR 0072) all worked, but the controls sat at the bottom of the My characters dock tool, and Ask your GM to add showed only once a character was already linked. Ian, running the test, could not find a way to give the PC a sheet. The GM's card also held only the table numbers, so the GM could not read the sheet behind them.

## Decision

Ian chose the guided two-step and a read-only copy of the sheet for the GM.

**The player's side.**

- **Holding a PC with no sheet linked**, the VTT tab shows **Your sheet for <PC>** above the map, with:
  - **Use <name>**, for a character in the Library named like the PC (by `normalizeKey`);
  - **From your Library…**, for any character in the Library;
  - **Build one** and **Import from PDF**, which open New character with the PC's name filled in;
  - **Not now**, remembered for the session.
- **Holding nothing**, the picker has **Bringing a new character?** under it, with the same choices but no Not now. Once a character is linked, **Ask your GM to add <name>** replaces it, as in ADR 0072.
- **The Sheets tab** shows the same card when nothing is linked, instead of a sentence pointing at My characters. My characters keeps Link a character for later changes.
- Linking does what it did: the numbers go to the GM to accept.

**The GM's copy of the sheet.**

- **The message.** A new client message, `sheetShare {creatureId, character}`, carries the linked character as its sheet shows it (`PlayerSheet`: the character without its private `notes` or the builder's `build`). `character` is null when the player unlinks.
- **When the player's Trifold sends it.** Main (`JoinedService`) sends it while holding a PC:
  - when the PC held changes;
  - when a character is linked or unlinked;
  - 1.5 seconds after the linked character is saved, so a sheet being edited goes once.

  It sends only what differs from the last share on that connection.
- **What the table server checks.** The device must hold that PC. It takes at most one share a second per browser, and ignores a share identical to the last one for that PC in this session.
- **The size cap.** `sheetShare` is the only message allowed past the 16 KiB cap, up to 256 KiB (`SHEET_SHARE_BYTES`). The socket's `maxPayload` rose to match. Anything else over 16 KiB is still refused as a bad message.
- **A sheet too large to send.** The player's Trifold first drops the text of features linked to a compendium record (the GM's compendium has it), then all feature text. If it still does not fit, it shares nothing and logs why.
- **It never waits for the GM.** It changes nothing the GM plays with: the card's numbers still change only through Accept.
- **Where the GM's Trifold keeps it.** The console writes the share to the PC card as `playerSheet: { character, from, sharedAt }`, and removes it on a null share. It is an optional field, so PC cards stay at version 2. Saving the PC form keeps the newest `playerSheet`, even if one arrived while the form was open.
- **Reading it.** On the Party tab, a PC with a shared sheet has **Read <PC>'s sheet**. It opens the sheet read-only: no Edit, no rolls. A line says who shared it and when.

`TABLE_PROTOCOL` stays at 1: `sheetShare` is a new message, and a table from before it rejects it as a bad message without harm.

## Consequences

- A player picks a PC and is asked for its sheet straight away. A player bringing their own character can link or make one before asking the GM to add it.
- The GM can read every linked player's sheet (attacks, spells, features, equipment) from the PC card, kept up to date by the player's Trifold.
- PC card files can hold a player's sheet, up to about 256 KiB. Campaign exports with the party carry it.
- The player's private notes never leave their Library.
