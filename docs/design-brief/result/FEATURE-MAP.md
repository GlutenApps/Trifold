# Feature map · where every control from FEATURES.md lives now

Legend: **Stage** = a major's tab · **Dock** = a minor tool · **Strip** = live
strip · **Top bar** · **Library** = outside the console. "Same" = unchanged
control, new home only.

## Global

| Item | Lives in | Notes |
| --- | --- | --- |
| Live scene title / "blackout" | Strip · TV section | Pip + "Live: …" or "Blackout" in warn |
| Player window open/closed | Strip · TV section | Icon button, `on` when open; also TV controls' live card |
| Combat "Round 3 · Aria" / "Set initiative" / none | Strip · Combat section | "No fight" when none |
| Now playing / "Muted" | Strip · Music section | Also the Music tool's header |
| Last dice total | Strip · Dice section | Also Dice tool result |
| Blackout (toggle) | Strip + TV controls | Ctrl+Shift+B |
| Open/close player window | Strip + TV controls | Ctrl+Shift+P |
| Panic mute | Strip + Music tool | Ctrl+Alt+M |
| Next / previous turn | Strip + Combat header | N / P |
| Undo last scene | Strip + TV controls | Ctrl+Shift+Z |
| Jump to compendium search | Ctrl+K | Opens Compendium in the non-combat group and focuses search |
| Hotkey table | Dock · Hotkeys tool; Top bar "Hotkeys" button | Escape relabelled "Close the open flyout"; Ctrl+M now "Music"; Ctrl+, "Settings, in the Library" |

## Campaign

| Item | Lives in | Notes |
| --- | --- | --- |
| Campaign list: new (name + Create), Import XML…, open, close | Library › Campaigns; Top bar switcher | Close also in the switcher, with the stop-sharing warning |
| Header name + "2024 rules" badge | Top bar breadcrumb; Campaign tab header | |
| Import into this campaign… | Campaign tab ⋯ menu; Library card ⋯ | |
| Party PC cards (name, player, class/level, HP, AC, init, PP), Edit, Remove, New PC card | Stage · Campaign | Row actions on hover/selection |
| Quick add textarea + Add PCs | Stage · Campaign | Behind a disclosure |
| Adventures, NPCs, Notes lists with empty states and add | Stage · Campaign | Same |

## Compendium

| Item | Lives in | Notes |
| --- | --- | --- |
| Kind tabs | Stage · Compendium (and Library › Compendium › Browse) | Segment |
| Search + 8 filters | Same | CR from/to merged into one "CR ¼ – 5" range control (opens both fields) |
| Results list with count and time | Same | |
| Record detail, 2024 layout, spell links, Back | Same | |
| Switch edition | Same | Labelled with the other edition ("Legacy" / "2024") |
| Duplicate to homebrew → editor (name, CR, abilities, features), Save, Changes from original, Delete… | Stage · Compendium (light editor) · Library › Compendium › Homebrew (full) | Ring on the tab while unsaved |
| Spell name from the tracker opens the compendium | Combat → Compendium tab | Same rule as Ctrl+K for which group |

## Encounters

| Item | Lives in | Notes |
| --- | --- | --- |
| List: New encounter; rows name, count, "fought n×", Open, Delete | Stage · Encounters (list view) | |
| Builder: name, Back to list; combatants table (name, count, role, remove); Add all PCs and per-PC; Add creature search + picker; Difficulty readout; Start combat | Stage · Encounters (builder) | Saves as you go; no draft state |

## Combat

| Item | Lives in | Notes |
| --- | --- | --- |
| Header: round/turn, roll mode segment, Roll remaining, Sort, Begin, Previous, Next turn (N), End combat | Stage · Combat header | Previous and End combat as icon buttons with tooltips |
| Initiative rows: init field with "roll", name, masked badge, hidden/holding/concentration/condition badges, HP with temp, death saves, move up/down | Stage · Combat | Move up/down as row actions |
| Inspector: AC, init; Reveal, Hide, Hold, Mark dead, Remove; damage row; condition row; concentration; counters/recharges pips; spell slots | Stage · Combat inspector | Five actions as an icon toolbar |
| Stat block with action buttons; PC card note | Stage · Combat inspector | |
| Inline prompts: concentration, save call, rolled damage | Stage · Combat, under the row or action | Stack; active row pins |
| Log with export and hide | Stage · Combat (column or collapsed row) | One store with Dice (Decisions 9) |
| Banners: records not found, errors | Stage · Combat, top of the tab | Same |

## Presenter → Map (major) + Scenes (minor) + TV controls

| Item | Lives in | Notes |
| --- | --- | --- |
| Scene tree: search, folders, rows with kind icon, title, live badge, edit / up / down | Dock · Scenes | Row actions on hover/selection |
| Click a row sends to the TV; hover preview | Dock · Scenes | **Changed**: click selects; Enter / double-click / ▶ sends; preview floats over the stage |
| New scene toolbar (title + title card, image…, map…, blank grid, folder); Recent | Dock · Scenes | |
| Selected scene card + Send to TV | Dock · Scenes | Plus "Open in Map" |
| Edit scene: title, subtitle, folder, show title, music on go-live, backdrop, DM notes, Remove scene | Dock · Scenes (Edit disclosure) | |
| Map editor: zoom/pan, grid alignment, place party, entry markers, creature tokens, hidden/masked/dead, drag mirrored, player camera, presets, linked encounter (start / resume / forget) | Stage · Map | Tools in a 36 px vertical strip; link tool opens a menu |

## Music → Music (minor) + Library › Music folders

| Item | Lives in | Notes |
| --- | --- | --- |
| Folders: add, remove, rescan; empty-state sentence | Library › Music folders | |
| Tracks table: search, kind filter, title, artist, duration, tags, Play now, Add to…, loudness badge | Dock · Music (Tracks section) | Artist shown in the now-playing line; columns compress at narrow |
| Playlists: new, select, rename, order, remove track, Play playlist | Dock · Music (Playlists section) | |
| Transport | Dock · Music (top) + Strip | |

## Settings → Library › Settings

| Item | Lives in |
| --- | --- |
| Library path, Choose folder…, Open Library folder, index status, Rebuild index | Library › Settings › Library |
| Sources: enable/disable, Re-import, Remove, Import XML…, progress, rules by source book | Library › Compendium › Sources |
| Displays: pick, refresh | Library › Settings › Displays |
| Appearance: dark / light | Library › Settings › Appearance |
| Backups: enabled, keep days, Back up now, list with Restore, Open backups folder | Library › Settings › Backups |
| About: version, SRD attribution, icon and font credits | Library › Settings › About |

## Minors

| Item | Lives in | Notes |
| --- | --- | --- |
| Dice: chips, modifier, N/A/D, Clear, Roll with expression, result with faces, Or type, roll log | Dock · Dice + Strip (chips, Roll, total) | One shared pool object |
| TV controls: status, Blackout, window, undo, dismiss handout, end break, overlays, handout, break | Dock · TV controls | |
| Turn order | **Removed** (Decisions 8) | Strip carries round, turn, N/P; Combat has the list |
| Now playing / transport | Dock · Music (merged) | |
| Hotkey sheet | Dock · Hotkeys | |
| Layouts: save, list with hotkey, name, summary, current highlight, Overwrite, Rename, up/down, Delete, Bring back starters | Dock · Layouts; current name on the top bar | |

## Not added (as instructed)
Scene preview outside Scenes, campaign notes side reader, detached roll log:
none added. The dock's tab strip has room for two more toggles at 300 wide if
they are ever wanted.
