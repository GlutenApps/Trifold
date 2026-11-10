# ADR 0016 · A sample campaign ships with the app

**Status:** accepted, 2026-11-07. Refines DESIGN.md §3 (Campaign) and §8 (content licensing).

## Context

A new Library is empty. A DM trying Trifold for the first time meets a blank Campaigns page, an
empty notes tree, no encounters and no scenes. That makes it hard to see what each part does,
and harder still to see how the parts connect: an encounter placed on a map, an NPC whose HP
carries between fights, a handout over a map on the TV.

The content rules (CLAUDE.md ground rule 3) allow SRD content, our own text and art the project may
redistribute. A sample campaign can stay within that: our own adventure text, SRD creatures,
and maps the project may redistribute. Map variants (night, flood) show off scene backgrounds
best, and the free maps that come with variants are licensed for non-commercial use only.

## Decision

- **One sample campaign ships in the package:** *The Lantern at Greyford*, a one-session
  adventure for four level-3 characters that touches every part of the app. Its source lives in
  `samples/greyford/`: `campaign.json` with readable slugs, one Markdown file per note, the
  map and handout images, and a credits file.
- **Built at build time.** `scripts/build-sample.ts` (part of `pnpm fetch:content`, and run
  again by `prebuild` and `smoke`) turns the source into
  `resources/sample/greyford.trifold-campaign`, an ordinary campaign export (ADR 0015). The
  conversion is a pure, tested function in `@trifold/importers` (`buildSampleCampaign`). Ids
  are ULIDs derived from the slugs and every timestamp is fixed, so each build is identical byte
  for byte and the app recognises the sample by its campaign id. The output is git-ignored;
  `check-content` refuses to build without it.
- **Every Library gets it once, new or existing.** After the index is ready, `LibrarySession`
  imports the bundled file through `CampaignPackager` (mode `new`) unless `library.json` says
  `sampleCampaign.added`. It then sets that flag, so deleting the sample is final. A Library that
  already has a campaign with the sample's id just gets the flag. A build without the file skips
  seeding and tries again next open. Seeding never stops a Library opening.
- **It never opens itself.** It is listed in Campaigns like any other.
- **Settings › Sample campaign** adds it back when it is missing, or puts it back as it ships
  when it is there (mode `replace`, which writes a safety backup first).
- **No music.** Campaign packages never carry music (ADR 0015); the scene notes suggest moods.
- **Maps are by 2-Minute Tabletop under CC BY-NC 4.0**, chosen because they come with variants:
  the tavern by night and day, the gorge at low water and in flood. They are a deliberate,
  temporary exception to shipping only MIT and CC-BY content, for testing before 1.0. Each map
  carries its credit in a corner (where the licence and the author ask for it), the About page
  repeats it, and `samples/greyford/images/CREDITS.md` records sources and changes. The maps were
  rotated or resized so each fills a landscape TV. The handout is our own, rendered by
  `samples/greyford/tools/make-handout.py`.

## Consequences

- The installer grows by about 6 MB, and so does each Library.
- `LibrarySettings` gains `sampleCampaign: { added }` with a default, so no schema version bump is needed.
  A Library restored from a backup made before this feature gets the sample on its next open.
- Changing the sample means editing `samples/greyford/` and rebuilding. A Library that already has
  it keeps its copy until the DM resets it from Settings.
- The sample's text is covered by the content rules like any other bundled content: no non-SRD
  game text.
- **The maps are non-commercial.** Trifold is free, so it may ship them, but they are not under the
  repo's MIT licence: a fork or release that is sold may not include them. Before 1.0, or any
  release that is not free, they are replaced with maps under an open licence or licensed with the
  author's written permission. `docs/RELEASING.md` carries the check.
