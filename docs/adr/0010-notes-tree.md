# ADR 0010 · Notes are a tree of folders with an editor beside it

**Status:** accepted, 2026-11-06. Refines `DESIGN.md` §5.2 and §6.3.

## Context

After the first one-shot the campaign notes were a flat list at the bottom of the Campaign tab,
each one a card with a plain textarea behind an Edit button and a Save button. The DM split the
session into many small notes by where the party was, which helped, but the list was still hard
to read through and the textarea hard to write in. A longer campaign would make both worse.

Comparable tools (Foundry journals, Obsidian vaults, LegendKeeper, Kanka) all organise notes as
a tree, start a note per session from a template, and lean on search to find a line mid-session.
Trifold already has a tree with folders, collapse, search and move-among-siblings: the scene
tree. `DESIGN.md` also carries Adventures, an ordered list of linked scenes, encounters and
notes, which the UI only ever rendered as a read-only row.

## Decision

- **Notes form a tree.** A note file gains `kind` (`note` or `folder`) and `parentId`, both with
  defaults so every existing note parses unchanged at the root; `order` is now the place among
  siblings. No schema version moves (the layout precedent from ADR 0003). The tree helpers move
  out of the scene tool into `@trifold/rules` (pure, tested) and both trees use them.
- **Folders replace Adventures in the UI.** The Adventures card is gone from the Campaign tab.
  The schema, importer and API keep the adventure record so old campaigns and campaign XML still
  load; the importer now also puts an adventure's notes in a folder named after it. Removing a
  folder moves its contents up a level unless the DM asks, in two clicks, to delete them too.
- **The Campaign tab is three sub-tabs: Party, NPCs, Notes.** Notes fills the panel with the tree
  on the left (find, new note, new folder, collapse) and the open note on the right, split by a
  drag edge. Under 640 px the panel shows one or the other with a Back arrow. The open note
  saves itself half a second after the last change and on blur or close; there is no Save
  button. Opening a note never writes it.
- **The body is formatted text stored as markdown** (Tiptap on ProseMirror with its markdown
  extension, all MIT): a toolbar for bold, italic, strikethrough, three heading levels, bulleted,
  numbered and check lists, quotes and dividers, plus tables and images so a note that holds
  them survives a round trip. Note files stay readable in any editor.
- **Rows drag; the arrows and the folder dropdown are gone**, in the scene tree too. Drop above
  or below a row to reorder, onto a folder's middle to go inside, onto the empty space below the
  rows for the root. The placement maths (`dropTarget`, `placeItem`) is pure and shared, and main
  applies the same function for `notes.move`, so the tree is right before the reply lands.
- **Search is a phrase search in memory, in the notes panel.** Markdown is stripped before
  matching so a hit reads as the editor shows it. Results replace the tree: each note's title,
  folder path and up to three snippets with the phrase marked; a snippet opens its note at that
  occurrence, highlighted in the editor and scrolled into view; Enter and Shift+Enter (or the
  arrows) step through every hit across notes.
- **Templates are Library-level files**, `templates/notes/<id>.json`, one name and markdown body
  each, seeded once with a session-prep outline in our own words (characters, strong start,
  scenes, secrets and clues, locations, NPCs, monsters, treasure) that the DM can edit or delete
  for good. The notes toolbar's template menu starts a note from one, keeps the open note as a
  new one, or opens the templates editor in the right pane.

## Consequences

- `notes.move(noteId, parentId, index)` is the one way a note changes place; it renumbers the
  destination folder from 0. The in-memory bundle mirrors main's placement, lift and delete
  rules; a failed call puts the list back and shows the error.
- Keyboard-only reordering went with the arrows; a later pass can add Alt+Arrow moves on a
  focused row if anyone needs them.
- Deferred, by choice: `[[links]]` with autocomplete and backlinks, an outline for long notes,
  a pinned-notes reader beside combat, and the tree's collapsed state surviving a restart.
