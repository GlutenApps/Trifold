# ADR 0060 — What a campaign shares with its players

**Status:** accepted, 2026-11-23. Imported content is now shared by book, not by file (ADR 0067); a campaign's whole-file shares from before still work. Character sheets that lean on shared content are not built yet (`docs/PLAYER-MODE.md`, Part 3).

## Context

Player mode (ADR 0058) gives each player their own Trifold with their own Library. To build and play a character in a GM's campaign they need the options that campaign uses: a homebrew item the GM handed out, the spells of a source the table plays with. They must not get what would spoil the game, and a player's Library must not become a way to pass books around (`DESIGN.md` §8).

The DM decided the shape (Ian, 2026-11-22 and 2026-11-23): shared content lives in the campaign; imported sources are shared by source and only their player-facing kinds; homebrew is shared record by record; creatures cross only as companions or as NPCs a player holds; and the content stays with the campaign on the player's side.

## Decision

**What is shared.** `CampaignSettings.shared` holds the GM's choices, empty until the GM turns something on in **Campaign › Shared sources** (named Shared with players at first; renamed by the DM, 2026-11-23). **Library › Compendium › Sources** shows the same choice for every campaign at once, under each imported source's Edit source:

- `sourceIds`: imported sources the campaign uses. A shared source gives its spells, items, feats, species, backgrounds, classes, conditions and rules. Its creatures never pass.
- `homebrewIds`: homebrew records, each shared from its page in the Compendium. A homebrew creature is not shared this way.
- With no setting: the stat blocks of the campaign's companion list, of NPC companions, and of NPCs a player holds at the table. Nothing is derived from encounters.
- Bundled SRD content is never sent.

A shared source marked as user content shows a warning beside the list.

**How it travels.** The table server reads the content from the Library's files (`main/table/sharedContent.ts`) and gives it a hash. It tells each device it knows the hash, on connect and when it changes (`shared {hash}`). A player's Trifold that holds a different hash fetches `GET /shared` with its device token as a bearer token; a browser that only reached the page gets nothing. The whole set is sent and replaced. An empty hash means nothing is shared, and the player's copy is removed.

**Where it lives for the player.** One source per joined campaign, in `joined/<campaignId>/shared/` (`source.json`, `records.jsonl`, the files an imported source has), with the new source kind `shared` and the id `shared:<campaignId>`. Each record is a copy under that source, with an id of its own there and `sharedFrom` (the name of the source it came from, and its non-SRD flag). Records from the table are checked one by one: anything that is not a record of that source is dropped.

**Where it shows.** The index holds the source like any other; the queries show a `shared` source only while its joined campaign is open, the way a campaign's own creatures are shown (ADR 0035). It is not listed in Settings › Sources. A shared record's page says "Shared by your GM" and offers no Edit; main refuses to draft a copy of one. Leaving the campaign deletes it with the rest of the folder.

## Consequences

- Unsharing removes a record at the next sync. It cannot un-show what a player already read.
- The content is bound to a campaign inside Trifold. That is a product boundary, not protection: the app is open source and the files are plain JSON.
- Sync is the whole set, not a per-record difference. A large shared source is sent again when one record in it changes. On a local network this is simple and quick enough; a difference by hash can replace it without changing the files.
- A homebrew change, a claim or a release makes the server look again; the GM does nothing.
- `PinnedRoll`, notes and the player's own homebrew are untouched: nothing of the player's is replaced by shared content.

## Built since

- **Player packs** (`.trifold-players`): ADR 0064.
- **A player's own copy stands in for a shared one.** When a player's own imported file (switched on, the book on) holds the same record and edition from the same book, or from a source of the same name as the GM's, the shared copy steps aside: it is marked like a book that is off, after every sync, import, re-parse and book change, so every query uses the player's copy. The player's Compendium says how many of the shared records are in their own books.
- **Sharing one homebrew record made from user content asks first**: a copy of an imported record carries its text, so the record page's Share with players shows the same warning as a shared source, with Share and Keep private.

## Still open

- Character sheets that keep working after the campaign is left (Part 3).
- A legal review of sharing imported sources, noted as open when this was planned.
