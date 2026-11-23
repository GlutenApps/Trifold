# ADR 0064 — Player packs

**Status:** accepted, 2026-11-23. Completes shared content (ADR 0060).

## Context

Shared content reaches a player's Trifold at the table. Before the first session, GM and players are usually not on the same network, so a player cannot see the campaign's homebrew or companions while preparing a character. `docs/PLAYER-MODE.md` planned a file for that.

## Decision

**Export for players**, at the foot of a campaign's Shared sources tab, writes a `.trifold-players` file: a zip with `manifest.json` and `records.jsonl`.

- The records are the open campaign's shared content in the form a player's Trifold keeps it (`selectShared`'s output, under `shared:<campaignId>`), so opening a pack and syncing at the table land the same files.
- Shared homebrew and the stat blocks of the companion list and NPC companions always go in. No NPC is held without a table, so held NPCs' stat blocks do not.
- A shared imported source or collection goes in only when the GM ticks it in the export section, with a warning that a pack can be passed on and never expires. The imported sources the campaign uses or shares that are left out are named in the manifest (`sourcesNotIncluded`), so a player who owns one knows to import it.
- The manifest carries the campaign's id and name, its edition settings, when the pack was made, the content's hash and the app version. Trifold sends the file nowhere.

**Opening a pack** (Join a campaign › Open a player pack…) shows the campaign, how much it holds and what it leaves out, and asks the name the GM will see when the campaign is not joined yet. It then joins the campaign (no address, no connection) and keeps the content as the campaign's shared source, every record checked as table content is (`cleanShared`). The campaign appears under Playing; at the first session its table is found by campaign id and syncs over the pack's content. Opening a newer pack updates the content offline.

**Older packs are refused.** The shared source records when its content was made: the pack's date, or the moment the table sent it. A pack whose content differs and is older than what the Library holds is refused, so a stale file never undoes what the table sent.

## Consequences

- A player can see the campaign's homebrew and companions while building a character, before anyone is on the same network.
- A pack's hash covers what was put in it, which usually differs from what the table shares; the first connection replaces the pack's content with the table's.
- Binding a pack's content to a campaign inside Trifold is a product boundary, not protection. Imported sources are opt-in per export for that reason.
