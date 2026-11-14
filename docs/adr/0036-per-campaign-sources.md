# ADR 0036 · Per-campaign sources: each source says which campaigns show it

**Status:** accepted, 2026-11-14. Builds Beta 5 (`DESIGN.md` §10) and amends §6.1 and §5.2:
`Campaign.enabledSourceIds` is superseded by `Source.campaignIds`.

## Context

Importing a Game Master campaign XML files that adventure's inline stat blocks as a source of
their own, "<name> (campaign file)". Every source showed in every campaign, so one adventure's
characters filled every other campaign's Monsters list, builder and search. The schema had a
per-campaign field, `Campaign.enabledSourceIds` (null for every source, or the subset a
campaign uses), but no UI and no reader.

A list on the campaign has a flaw: a campaign that picked its sources would miss every source
imported later until the DM went back and ticked it, and a campaign file's source would have to
be switched off in every other campaign, including ones created after it.

Copying an NPC from another campaign (**From another campaign…**) kept its stat block reference,
which could point at the old adventure's file or the old campaign's own creatures (ADR 0035):
records the new campaign should not see.

## Decision

1. **The source says which campaigns show it.** `Source.campaignIds`: null (or absent) for
   every campaign, or a non-empty list of campaign ids. Only imported files (`xml`, `open5e`)
   can be limited; the bundled SRD, homebrew and campaign creatures cannot. The global enabled
   flag is unchanged and still applies first.
2. **A campaign file's stat blocks start as that campaign only.** `importCampaignXml` writes
   `campaignIds: [the campaign]`, whether it made a new campaign or merged into the open one.
   An ordinary compendium XML starts as every campaign.
3. **Where it is set:** Library › Compendium › Sources, beside priority. An imported file's row
   says where it shows ("Every campaign", "Only Silt Springs") and has a campaigns icon that
   opens an inline panel: **Every campaign** or **Only these campaigns** with a checklist. Each
   change saves at once; the last ticked campaign cannot be unticked.
4. **What "shows" means:** the compendium list, the encounter builder's picker, suggestions,
   text search and the editions lookup answer only from sources the open campaign sees. With no
   campaign open, every enabled source shows, so the Library can still be browsed. Records stay
   in the index; a reference to one (an old encounter row) still resolves by id.
5. **Older campaign files are linked once.** On opening a Library, a source named
   "… (campaign file)" with no `campaignIds` is limited to the campaigns whose files mention its
   id (NPCs, encounters, fights, maps), or set to every campaign when none do. The answer is
   written to its `source.json`, so this runs once per source.
6. **A campaign that arrives using a limited source sees it.** Importing a campaign package
   (ADR 0015) adds the new campaign to every limited source its files mention.
7. **Copying an NPC brings its stat block when needed.** When the copied NPC's stat block is in
   a source the new campaign cannot see (another campaign's file or creatures), that one record
   is copied into the new campaign's creatures (ADR 0035, made when first needed) and the NPC
   points at the copy. An identical creature already there is reused, so two NPCs sharing a stat
   block share one copy. A stat block the campaign can see is left as it was. Nothing else from
   the old adventure comes along.
8. `Campaign.enabledSourceIds` stays in the schema so older files parse, and is ignored.

## Consequences

- The index's `sources` table gains a `campaigns` column (a JSON array, NULL for every
  campaign), and every search, suggestion and text query binds the open campaign's id. The index
  version moves to 4, so it rebuilds once from files.
- Re-importing a file keeps its campaigns.
- A source limited only to campaigns that were later deleted shows in none of them and reads
  "No campaign" on the Sources page, where the DM can widen or remove it.
