# ADR 0017 · Global search in the top bar, over one deep-link contract

**Status:** accepted, 2026-11-09. Refines `DESIGN.md` §6 (adds §6.9) and §9; amends ADR 0009
(a pop-up without a header).

## Context

Mid-session the DM needs one thing by name: the NPC the party just asked about, the note for
this room, the encounter prepared for it, a spell. Each of those lives in a different tab or
tool, each with its own list and its own find box (the compendium filter, Find in notes, the
scene filter), and the DM has to remember which. Feedback after the first sessions asked for
one box that finds anything.

A result is only useful if choosing it lands on the item. That needs a way for one feature to
open another's item, which also nothing else had: note links, backlinks and "open the fight's
map" were all deferred for want of it. The shell already placed tabs by a rule in three places
(Ctrl+K, a starting fight, a map scene) through `openMajor(kind, { avoid })`.

## Decision

### One deep-link contract

`navigate({ type, id, anchor? })` in `renderer/navigate.ts` is the one way a feature opens
another feature's item: notes, folders, NPCs, PCs, encounters, scenes, compendium records and
web tabs, with optional anchors (a phrase and occurrence in a note or an encounter's DM notes).
It brings the home forward, posts the target, and the owning panel lands it: selects, scrolls
and flashes (`landOn`, `data-nav`). `docs/DEEP-LINKS.md` is the reference. Each panel keeps its
own selection state; nothing is lifted into a router.

### Where a closed tab opens

An open tab is activated where it is and never moved. A closed tab joins the only group when
there is one. With two groups it avoids the VTT first (the map must stay visible at the table),
then a running fight, and otherwise joins the focused group. The rule is one pure function,
`landingGroup`, tested with the layout math; `openMajor`'s `avoid` stays for the three
existing callers.

### Search

- A field in the **middle of the top bar**, console only: equidistant from both stage groups,
  visible in every layout and dock mode, and clearly "everything" rather than a filter for the
  tab under it. Under 960 px it becomes a search button beside the breadcrumb and the field
  moves into the pop-up.
- Results are a `search` pop-up (ADR 0009's mechanism: one at a time, Escape or a click
  elsewhere closes) centred under the field and **without the header**, since the field is the
  heading. `Ctrl+F` focuses the field; Cmd+F on macOS. Nothing else used the combo.
- **Name and title matching only**, case-insensitive with punctuation and apostrophes folded,
  ranked exact, then prefix, then the start of a later word, then anywhere. Groups in a fixed
  order: Notes, NPCs, Party, Encounters, Scenes, Compendium, Web tabs; six rows per group and
  a count of the rest. An encounter also answers to its members' names, after every name match,
  and says who it was. Music is left out by choice; tracks have their own home in the Music
  tool.
- **No separate index.** The campaign is already in memory and small, so `searchLocal` ranks it
  on every keystroke, and a change to the bundle re-ranks under an open query. The compendium is
  already indexed in SQLite, so one new call, `compendium.suggest`, matches display names across
  every kind in the same tiers, editions collapsed, after an 80 ms debounce with stale answers
  dropped by sequence. Campaign rows appear at once; the compendium group fills in last without
  moving the active row.
- Arrows move across groups with wrap-around, Enter opens the active row through `navigate`,
  Escape clears. The query stays after a pick, for a second look.
- **Text inside the campaign** (added 2026-11-09): from two characters on, a **Mentioned in**
  group lists every note whose body holds the phrase, and every encounter, NPC, PC and scene
  whose notes do, one row per item with its first snippet (markdown stripped, phrase marked)
  and the number of mentions, most first. A note opens at that occurrence through the note
  anchor (the Notes panel's find shows the phrase, the editor highlights it); an encounter opens
  in the builder with the phrase selected in its DM notes. A note can be listed under Notes (by
  title) and under Mentioned in (by text) at once. Stripped bodies are cached per saved note,
  so a keystroke only scans text; a test holds it under the 50 ms search budget on 800 long
  notes.

## Consequences

- Every searchable item has a `data-nav` landing and every panel a `useNavTarget`; a new type
  is a variant, a home and a landing. Note links (deferred in ADR 0010) now have their
  mechanism.
- Panels mounted while hidden (the Stage keeps closed majors mounted) take a target at once;
  a sub-tab switch is a two-step landing (page, then inner panel), covered by the hook's
  "run again on mount" behaviour.
- Three sub-tab and selection states stay local (Campaign sub-tab, Notes selection, Encounters
  draft); the hook drives them rather than moving them into stores.
- The `search` pop-up is the first without a header; the ADR 0009 pattern otherwise holds.
- **Compendium text and Show all** (added 2026-11-09): a **Compendium text** group lists
  records whose text holds the phrase but whose name does not, from the same FTS5 index as the
  Compendium tab (`compendium.searchText`: a phrase match on the text column, bm25 order,
  editions collapsed, an FTS `snippet()` per row). Any group with more rows than it shows has a
  **Show all** button in its header: the pop-up then lists only that group, every row (a
  compendium group asks the index again for up to 100), with a Back row above it; Escape steps
  back out before it clears. A compendium count that reached the index's limit reads `12+`.
- Not done: tracks and playlists; a hotkey to open a result in the other group; conditions in the compendium (fetched from Open5e in a separate change).
