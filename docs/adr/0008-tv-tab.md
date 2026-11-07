# ADR 0008 · The TV tab: one screen, one list

**Status:** accepted, 2026-11-06. Amends ADR 0004: the Map major becomes the TV major and
the TV controls minor is removed.

## Context

ADR 0004 split the presenter three ways: Scenes (dock, the tree and the edit form), Map
(stage, the canvas for maps and blank grids) and TV controls (dock, overlays, handout, break,
plus copies of blackout, undo and the player window). Coming back to the app after a break,
the DM could not tell which of the three to open to work on visuals:

- Send to TV lived in three places, blackout and undo in two, and "is it live" badges in five.
- The Map tab was empty for title cards and image scenes, so half the scenes had no screen
  view at all.
- TV controls was a grab-bag: three of its six items were already on the live strip and the
  rest (four overlay toggles, handout, break) are small.

## Decision

Two pieces: **the list** and **the screen**.

- **Scenes** stays a dock tool and is the list: tree, new, find, recent and the metadata
  form. Click selects, Enter or ▶ sends. "Open in Map" is gone; selecting a map already
  opens the tab.
- **TV** is a stage tab (the former Map major, same `map` key in saved layouts) that always
  shows the selected scene whatever its kind, or the live scene when nothing is selected.
  Maps and blank grids get the map editor; title cards and images get a preview frame. Its
  header carries the scene name, a live / selected / blackout badge, Send to TV, and an icon
  toolbar with blackout, undo, the player window, and pop-ups for overlays, handout and
  break. When the selected scene is not the live one, the header names the live scene and
  one click selects it.
- **TV controls** is removed. Library schema 3 → 4 drops its dock section from saved layouts
  and starter presets without resetting them. Ctrl+T and the strip's TV text open the TV tab.

**The live strip is a mirror, never a home.** Every strip button exists in its tool as well,
with a different accessible name (CLAUDE.md UI conventions). The strip is for the moments
the tool is not on screen.

## Consequences

- One answer to "where do I work on visuals": pick in Scenes, see and shape it in TV, send.
- Handout and break need the TV tab on stage. The Table and Combat starters have it; in a
  Prep-style layout Ctrl+T brings it up.
- The dock loses a section, which frees vertical space for Scenes and Music, the tall tools.
- DESIGN.md §6.5 "clicking a scene sends it" was stale since ADR 0004 (click selects, Enter
  sends) and is corrected in the same change.
- The header is three groups in the order a DM needs them: the TV itself first ("Open TV",
  which becomes a red on-air "TV on" tally while the window is open, mirrored on the strip
  and the tab pip), then what to show (Send to TV, Blackout, Break) as text buttons, then the
  tools (undo, overlays) as icons. The tally has its own colour token; it is not the danger
  red. User-facing text says "TV" everywhere; "player window" stays in code and docs.
- Handouts are parked: the player still renders them and the store keeps `showHandout`, but
  the console has no control for them until the feature earns its place.
- The TV tab steps through the prepared scenes on its own: previous and next buttons and a
  jump list in the header (and Ctrl+Alt+Up / Down) select a scene, never send it. Scenes
  remains the only place to add, edit, reorder or remove. The live chip is solid so it is
  never missed.
- The tab is titled VTT (the virtual tabletop); "TV" names the physical display, so the
  buttons stay Open TV, Send to TV, Blackout. With nothing sent yet the strip and the tab say
  "Nothing live" and Blackout is disabled: the player's initial black is not a blackout.
- Entry markers are removed from the map editor: the DM never used them, and clicking the map
  places the party just as well. The `entryMarkers` field stays in the scene schema so old
  files load; the editor ignores it. The Scenes tool uses a clapperboard glyph so it no
  longer shares the picture frame with the map's Backgrounds tool.
- Not done: a picture-in-picture of the live output while a different scene is selected.
