# ADR 0067 — Sharing is by book; Files is housekeeping

**Status:** accepted, 2026-11-23. Completes books as the unit (ADR 0061); changes how ADR 0060 shares imported content.

## Context

After books, stars, collections and duplicates, the Files tab still carried **Edit source** on every imported file, with three panels: the file's books and their 2024 rules, **Shows in** (the campaigns the file shows in, ADR 0036) and **Shared with players** (ADR 0060). Rules were already set on the Books tab; sharing a file of 150 books shared all of them or none. The DM asked to keep Files but take those controls out of it, with sharing done by book (2026-11-23).

## Decision

**Sharing is by book.** `CampaignSettings.shared` gains `bookKeys`. A shared book gives the campaign's players its player-facing records (spells, items, feats, species, backgrounds, classes, conditions, rules; never creatures), read through the index as a shared collection's books are, from the imported files that are on. A book in a shared collection and shared by itself is sent once.

- **Books tab:** each row has a share button (the party icon), pressed when some campaign shares the book, its tooltip naming the campaigns. A selection has **Share…**. Both open **Share with players**: one checkbox per campaign, half-ticked when only some of the selected books are shared there, with the user-content warning when a book comes from a file marked as user content. **Show › Shared with players** filters the list. `books.share(keys, campaignId, share)` writes the campaign's file; the sharing overview gains `byBook`.
- **Campaign › Shared sources:** a **Books** section lists the shared books, each with how many records players get and Stop sharing, and **Share a book…** offers the campaign's books (on, in its collections when it uses some) that hold anything for players.
- **Whole files shared before** (`shared.sourceIds`) still share, and the campaign's tab lists them as "All of <file>" with Stop sharing. Nothing writes `sourceIds` any more; `sources.setShared` is gone.
- **Export for players** offers shared books as it offers collections; `PlayerPackOptions.bookKeys`.

**Files is housekeeping.** A row keeps its on switch, badges, record counts, import warnings, Re-parse and Remove. Edit source and its three panels are gone:

- 2024 rules are set on the Books tab. A file whose copies clash says so with **Mark rules on Books…**, which opens the Books tab.
- **Shows in** is no longer a control. A Game Master campaign file's stat blocks still start in their campaign only (ADR 0036); the row says **Only in** that campaign, with **Use in every campaign**. Limiting a campaign to some books is done with collections (ADR 0062). A file limited before keeps its limit.

## Consequences

- Sharing one book of a big compendium no longer means sharing all of it.
- A file cannot be limited to some campaigns any more except as a campaign file's own stat blocks; collections limit from the campaign's side instead.
- `sources.setCampaigns` stays for Use in every campaign. `sources.setEdition2024Books` has no screen any more; the Books tab's Rules (`books.setRules`) does the same by book.
