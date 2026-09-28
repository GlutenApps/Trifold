# Trifold console: feature and control inventory

Everything the console does today, grouped by what it is. "Major" is a candidate for the stage, "minor" for the dock, "global" for a toolbar or status strip. Names are the ones in the app; keep them unless a shorter one is clearly better.

Placeholder content for mockups: campaign "Sunken Keep", PCs Aria (Sam, Wizard 5, HP 28, AC 13) and Brannoc (Kim, Fighter 5, HP 44, AC 18), creatures Goblin Minion, Goblin Warrior, Worg, Mage (all SRD), scenes "The Sunken Keep" (title card) and "Silt Springs Map" (map), playlist "Tavern Night".

## Global (always reachable)

Status the DM must see at a glance: live scene title or "blackout" · player window open/closed · combat "Round 3 · Aria" or "Set initiative" or none · now playing title, or "Muted" · last dice total.

One-tap actions: Blackout (toggle) · Open/close player window · Panic mute · Next turn · Previous turn · Undo last scene · Jump to compendium search.

Hotkeys (fixed):

| Key | Action |
| --- | --- |
| Ctrl+Shift+B | Toggle blackout on the player window |
| Ctrl+Shift+P | Open or close the player window |
| Ctrl+Shift+Z | Undo the last scene change |
| Ctrl+K | Jump to the compendium search |
| N / P | Next / previous turn |
| Ctrl+Alt+P | Play or pause music |
| Ctrl+Alt+→ / ← | Next / previous track |
| Ctrl+Alt+M | Panic mute all audio |
| Ctrl+D | Dice |
| Ctrl+M | Music transport |
| Ctrl+T | TV controls |
| Ctrl+/ | Hotkey sheet |
| Ctrl+, | Settings |
| Ctrl+Shift+M | Maximize or restore the focused panel |
| Ctrl+1 … Ctrl+9 | Apply layout 1 … 9 |
| Escape | Close the open drawer |

## Major: Campaign

- Campaign list: new campaign (name field + Create campaign), Import campaign XML…, open one, Close campaign. Header shows the name and a "2024 rules" badge; Import into this campaign…
- Party: PC cards (name, player, class and level, HP, AC, initiative bonus, passive perception) with Edit and Remove; New PC card; Quick add (one PC per line: Name, Player, Class L, HP, AC, Init, Speed, PP) + Add PCs.
- Adventures (list), NPCs (list), Notes (markdown notes list). Each has a "No … yet" empty state and an add action.

## Major: Compendium

- Kind tabs: Monsters, Spells, Items, Feats, Species, Backgrounds, Classes.
- Search field ("Search names and text") + filters: source, edition (2024 / legacy / all), CR from, CR to, type, size, environment, "NPCs and monsters".
- Results list: name, CR, type, size, edition badge, source chip. Result count and search time ("12 results · 0.6 ms").
- Record detail: stat block in 2024 layout (abilities, saves, skills, senses, traits, actions, bonus actions, reactions, legendary actions, lair). Spell names inside are clickable and open the spell; Back returns. "Switch edition" toggle when a 2024 and a legacy version both exist.
- Homebrew: Duplicate to homebrew → editor (name, CR, abilities, features), Save, Changes from original, Delete… (with confirm).
- Clicking a spell name from the combat tracker also opens the compendium at that spell.

## Major: Encounters (builder)

- Encounter list with New encounter; each row shows name, combatant count, results ("fought 1×"), Open, Delete.
- Builder: name, Back to list; Combatants table (name, count with number field, role ally/enemy/neutral, remove); Add all PCs and individual PC buttons; Add creature search with a results picker; Difficulty (2024 budget) readout ("Enemy XP 150 · Moderate"); Start combat.

## Major: Combat (tracker)

- Header: "Round 3 · Aria" or "Set initiative"; roll mode segment Normal / Adv / Dis; before combat starts: Roll remaining (n), Sort, Begin; during: Previous, Next turn (N); End combat.
- Initiative list rows: initiative number field (with "roll" when empty), name, masked name badge (what players see until revealed), hidden / holding / concentration / condition badges, HP "28/44 +5 temp", death saves, move up/down.
- Inspector for the selected combatant: AC and init; Reveal name, Hide, Hold, Mark dead, Remove; damage amount + damage type + Damage / Heal / Temp HP; condition picker + duration + Add condition; concentration field + Concentrate; counters and recharges (one pip per use, click to spend); spell slot tracker (pips per level, spend and restore).
- Stat block of the selected monster with action buttons: attack (rolls to hit and damage), multiattack, feature rolls, save calls. PC rows show "PC card: no stat block. Ask the player."
- Inline prompts, never modal: concentration check ("Aria must make a DC 13 Constitution save to keep concentrating" with roll / keep / drop), save call panel (DC, ability, per-target results, apply damage half/full), rolled damage waiting for a target (choose target, half, dismiss).
- Log: every roll and turn, "export" (save as text) and "hide".
- Banners: records not found, errors.

## Major: Presenter (scenes)

- Scene tree: search ("Find scene"), nested folders, rows with kind icon, title, "live" badge, per-row edit / move up / move down. Click a row to send it to the TV; hover shows a preview.
- New scene toolbar: title field + New title card, New image scene…, New map…, New blank grid, New folder. "Recent:" links to the last scenes shown.
- Selected scene: preview card ("Selected: The Sunken Keep", Send to TV).
- Edit scene: title, subtitle, folder, Show title on TV (follow overlay setting / always / never), Music on go-live (keep current audio / a playlist), backdrop, DM notes, Remove scene.
- Map editor (for map and blank-grid scenes): canvas with zoom and pan; grid alignment (click two opposite corners of one cell); Place party (click the map or an entry marker); entry markers (name field, add, remove); creature tokens (Find creature to place, count); token states hidden / masked / dead; drag tokens (mirrored to the TV); "Show the players what you see now" (player camera); camera presets; linked encounter: start or resume combat from the tokens, or forget the link.

## Major: Music (library)

- Folders: add folder…, remove, rescan; "No tracks. Add a folder of MP3, OGG, FLAC, WAV or M4A files."
- Tracks table: search, kind filter (Music / Ambience / Effect / all), title, artist, duration, tags, Play now, Add to… (playlist), loudness measured badge.
- Playlists: new (name + Add), select one, rename, track order, remove track, Play playlist.
- Transport (also a minor tool, see below).

## Major: Settings

- Library: path, Choose folder…, Open Library folder, index status ("Index: ok"), Rebuild index.
- Sources: imported compendium files with enable / disable, Re-import, Remove; Import compendium XML…; import progress bar; "2024 rules by source book" list.
- Displays: pick the display for the player window, refresh.
- Appearance: theme dark / light.
- Backups: enabled, keep days, Back up now, list of backups with Restore, Open backups folder.
- About: version, SRD attribution text with licence disclosures, icon credits (game-icons.net), font credits.

## Minor: Dice

- Pool chips d100, d20, d12, d10, d8, d6, d4 (click adds one, right-click takes one away, count badge); modifier stepper (−, value, +); Normal / Adv / Dis (Adv and Dis only for a lone d20); Clear; Roll showing the expression ("Roll 1d20 + 2d6 + 3"); result total large with faces; "Or type" field for expressions like 4d6kh3; roll log (total, label, faces, time, Clear).
- The same pool is shared wherever dice appear; today a compact strip of the chips, Roll and the last total also sits in the status bar.

## Minor: TV controls

- Live status; Blackout; Open / close player window; Undo last scene; Dismiss handout; End break.
- Overlays: Scene title, Initiative strip, PC health bars, Round counter (checkboxes).
- Handout: title, text, Show text handout, Show image handout… (picks a file).
- Break: title, minutes, Show break screen.

## Minor: Turn order (combat quick view)

- Round, Previous, Next turn, Open tracker; compact list: initiative, name, HP state (healthy / bloodied / down), active highlight; click selects that combatant in the tracker.

## Minor: Now playing (transport)

- Title · artist · playlist or "Nothing playing"; ⏮ Play/Pause ⏭ Stop; Panic mute / Unmute; position slider with time; Master, Music volumes; crossfade seconds; output device select; "Measuring loudness: n tracks left".

## Minor: Hotkey sheet

- Table of every registered hotkey and its description.

## Minor: Layouts

- Save current as new (name field); list rows: hotkey label (Ctrl+1…), name and a summary of what it contains, current-layout highlight, Overwrite, Rename, move up/down, Delete; Bring back the starter layouts. Starter set: Prep, Table, Combat.

## Minor candidates that do not exist yet (do not add, but the dock could leave room)

- Scene preview on hover (exists inside the presenter today).
- Campaign notes as a side reader while running combat.
- Roll log detached from dice.

## Table-time flows to design around

1. **Start of session:** open campaign → open player window on the TV → send a title card → start a playlist.
2. **Exploration:** send a map scene → place the party at an entry marker → drag tokens as players move → show a handout image → black out during a break.
3. **Combat from a map:** map scene live → "Start combat" from its tokens → roll remaining initiatives → Begin → each turn: select the creature, click an attack on its stat block, apply rolled damage to a target, add a condition → Next turn → End combat (log kept with the encounter).
4. **Quick lookup mid-combat:** Ctrl+K, type a spell, read it, get back without losing the tracker state.
5. **Dice anytime:** click d20, click d6 twice, Roll; the total shows where the DM is looking.

## Sizes that must fit

Compendium filters (8 controls), the combat header (7 controls), the inspector rows and the transport row are the widest things. Combat plus presenter side by side is the widest arrangement; at 1366 px each gets about 600 px.
