# ADR 0062 — Collections of books, used and shared by campaigns

**Status:** accepted, 2026-11-23. Builds on ADR 0061 (books) and ADR 0060 (shared content).

## Context

With books as the unit (ADR 0061), a GM with a large compendium still needs to say which books a campaign plays with and which its players get. Ticking books one by one in every campaign does not scale. The DM asked for collections (Ian, 2026-11-23).

## Decision

**A collection** is a named group of books, by `bookKey` (a file's unnamed records included, as `file:<sourceId>`). Collections live in `library.json` (`collections: [{ id, name, bookKeys, campaignIds }]`), beside the book settings, and are managed on the Books tab of Library › Compendium › Sources: a Collections section with each collection's book count, the campaigns that use it and the campaigns that share it; New collection; Edit (name, Used by, Shared with players); Delete, which keeps the books. On the Books list, a collection can be picked as a filter, and a selection can be added to a collection or taken out of the picked one.

**Used by.** A campaign named in a collection's `campaignIds` uses its books: while it is open, the imported files answer only for the books in the collections it uses. The SRD, homebrew and the campaign's own creatures always answer. A campaign in no collection shows every book, as before. This follows ADR 0036, which keeps the campaigns a file shows in on the file, in the Library; both limits apply. Main computes the campaign's books from the settings on each query (`campaignBooks` in `packages/rules`) and the queries filter with `campaignBooksFilter`.

**Shared with players.** `CampaignSettings.shared` gains `collectionIds`. A shared collection gives the campaign's players its books' player-facing records, read through the index (`recordsOfBooks`) and grouped by the file they are in, so each keeps its source name and non-SRD flag; a switched-off file shares nothing, and a file the campaign does not see shares nothing. It is set from the collection's Edit on the Books tab (`books.shareCollection`, which writes each campaign's file) or from the campaign's Shared sources tab. Sharing stays in the campaign, as ADR 0060 placed it.

## Consequences

- A GM sets a campaign's books once, with a collection, instead of per book or per file.
- A campaign exported to another Library keeps the collection ids it shares, which name nothing there; it then shares nothing through them. Which collections a campaign uses does not travel, as a file's campaigns do not.
- A collection used by a campaign that is empty leaves that campaign with no imported books, which the Collections section's count makes visible.
- Deleting a collection stops every campaign sharing it.

## Next

- The Duplicates tool: built, ADR 0063.
- Per-file sharing and "shows in" under Files › Edit source remain for now; collections are the way to do both by book.
