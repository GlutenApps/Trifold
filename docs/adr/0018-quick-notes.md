# ADR 0018 · Quick notes in the dock, filed in a Quick Notes folder

**Status:** accepted, 2026-11-09. Amends ADR 0009 (a third dock tool) and refines ADR 0010
(notes). Implements `DESIGN.md` §6.3, quick notes.

## Context

At the table things come up that the DM wants to keep: the name they just invented for the
innkeeper, the bribe the rogue promised, the door the party did not open. Writing one down
meant switching to the Campaign tab, picking the Notes sub-tab, choosing a folder and making a
note, which is long enough to lose the thread of the scene or the fight.

## Decision

- **A dock tool, Quick notes**, beside Music and Scenes (`MINOR_KINDS` gains `quickNotes`;
  a layout saved without it gets it as a closed section, so no Library schema change). It is a
  section in a wide or narrow dock and a flyout from the icon rail.
- **`Ctrl+N`** opens it from anywhere in the console and puts the cursor in the title. Nothing
  else used the combo; plain `N` (next turn) needs no modifier.
- **The capture form** has a title, the formatted body (the notes editor and its toolbar) and a
  **Save** button. The title is required: Save stays off until there is one. Enter does not
  save, because in the body it starts a new paragraph or list item; `Ctrl+S` saves from inside
  the form. Escape drops the draft. Save and Escape put focus back where the DM was (the last
  focused element outside the dock), and a flyout closes. The current tab never changes.
- **Quick notes are ordinary notes** in a folder titled Quick Notes. The folder carries
  `role: "quickNotes"`, so renaming or moving it keeps it the Quick Notes folder; when it is
  missing (never made, or deleted) the next capture makes a new one at the end of the root. Main
  does both writes in `notes.capture`, one capture at a time, so two quick saves never make two
  folders. A captured note records `capture: { at }`, the time it was taken; an in-game time
  can sit beside `at` later. Both fields are optional, so no campaign schema version moves (the
  ADR 0010 precedent).
- **Membership is by place.** The tool lists the notes inside the folder, at any depth, newest
  first, with a find field. A note opens in the same pane the notes panel uses (rename, tags,
  formatting, delete) plus **Move to** a folder and **Open in Notes** (a deep link, ADR 0017).
  Moving a note out of the folder makes it an ordinary note; it leaves the list and keeps its
  `capture` stamp. Moving one back in makes it a quick note again.
- No templates in the capture form. The player window is unchanged.

## Consequences

- The dock has three tools; at 900 px high the last open one scrolls inside, as before.
- Everything that works on notes works on quick notes: the notes panel, global search,
  backups, campaign export and import.
- Drag-and-drop stays in the notes panel; the dock moves notes with the folder menu.
- Not done: an in-game timestamp, a capture template, tagging a quick note to an NPC or an
  encounter while writing it.
