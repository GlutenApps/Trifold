# Trifold console shell · specification

Scope: the console window only. The player window is untouched. Every colour,
size and font comes from `TOKENS.md`; class names below refer to
`tokens/tf.css`, which shows how they combine. Placeholder content is from
`FEATURES.md`. Names are the app's names unless a shorter one is listed here.

## 0. Decisions (settled in the session; follow them)

1. **Two spaces.** The Library (campaigns, compendium sources and homebrew,
   music folders, settings) and the console (the inside of one campaign).
2. **One campaign at a time.** Opening another closes the current one. If a
   scene is on the TV or combat is running, a warning appears first: "Closing
   stops sharing to the player window and ends the session." Options: Keep
   running · Stop sharing and close. This is the only modal in the app.
3. **Frameless window.** The 34 px top bar is the title bar: drag region, with
   minimize / maximize / close at its right end.
4. **No rail.** Majors are tabs; all five are open by default in group 1.
5. **Majors only on the stage, minors only in the dock.** Never the reverse.
   Majors: Campaign, Compendium, Encounters, Combat, Map. Minors: Dice,
   TV controls, Music, Scenes, Hotkeys, Layouts.
6. **Presenter split.** The map editor is the Map major; the scene tree,
   new-scene toolbar, Send to TV and the edit-scene form are the Scenes minor.
7. **Music is a minor.** Transport, playlists and the track list live in the
   dock's Music tool. Folder management lives in the Library.
8. **Turn order minor removed.** The live strip shows round, whose turn, and
   previous/next; the Combat major has the list.
9. **One roll log.** Pool rolls, tracker rolls and save calls go to one store;
   every entry carries its source. Dice shows the latest rolls from anywhere;
   Combat shows the same store filtered to the current fight, with dice faces
   in each line; Export saves the fight's slice.
10. **Scenes rule.** Click selects and previews (a map opens in Map). Enter,
    double-click, or the row's ▶ sends to the TV. The pencil edits. Nothing
    goes live by accident.
11. **Homebrew inside a campaign is light.** Duplicate to homebrew opens an
    editor for name, CR, abilities and features in the Compendium tab. Imports,
    sources and enable/disable are Library-only.
12. **Unsaved ring** appears in exactly two places: a homebrew edit not yet
    saved, and a handout typed but not shown. Encounters save as they go and
    keep their place when closed; they never show the ring.
13. **Hotkeys are unchanged** except Escape, now "Close the open flyout". No
    new hotkeys were added (open: majors have none beyond Ctrl+K).
14. **Layouts are app-wide**, not per campaign; Ctrl+1–9 do nothing in the
    Library.

Open (ask before choosing): hotkeys for majors; whether the Library shows the
strip when nothing is live (spec says yes if a campaign is open, no otherwise).

## 1. Spaces

### 1.1 Library
Reached from the mark (top-left), the switcher's "Library" row, or Ctrl+,.
Layout: top bar (`space=library`) · left nav 220 px (`.td` rows: Campaigns,
Compendium, Music folders, Settings) · content area, padding 28 × 40, content
max-width 880. No stage, no dock, no tabs.

- **Campaigns**: heading + "Import campaign XML…"; new-campaign row (name
  input 320 + "Create campaign" primary); cards in a 2-column grid (name, "2024
  rules" badge, party pips, counts, last played; Open; ⋯ with "Import into this
  campaign…"). Open enters the console.
- **Compendium**: segmented Browse | Sources | Homebrew. Browse = the same
  search + record view as the console's Compendium tab. Sources = rows with
  enable checkbox, name, edition badge, record count, imported date, Re-import,
  Remove; "Import compendium XML…" primary; import progress card (file, %,
  n of m, Cancel); "2024 rules by source book" list; Index card ("Index: ok",
  Rebuild index). Homebrew = list + full editor (Save, Changes from original,
  Delete… with confirm).
- **Music folders**: rows (path in mono, track count, formats, rescanned date,
  Rescan, Remove); Rescan all; Add folder… primary; loudness progress; empty
  state "No tracks. Add a folder of MP3, OGG, FLAC, WAV or M4A files."
- **Settings**: Library (path, Choose folder…, Open Library folder, Index
  status, Rebuild index); Displays (select display for the player window,
  refresh); Appearance (Dark | Light); Backups (Enabled, keep days, Back up
  now, list with Restore, Open backups folder); About (version, SRD
  attribution and licence text, icon credits game-icons.net, font credits).

When a campaign is open, the Library keeps the live strip at the bottom and
shows "Back to <campaign> ●" on the top bar's right. Nothing else changes.

### 1.2 Console
Top bar · stage + dock · live strip. Exists only while a campaign is open.

## 2. Chrome

### 2.1 Top bar (34 px, `bg-rail`, 1 px `border` below)
Left → right, gap 8, left padding 10:
- Mark (20 × 17). Click: Library.
- Console: `›` then the breadcrumb: campaign name (600, truncates at 260 px),
  "2024 rules" badge, ▾. Click: the **switcher** menu (`.fly`, 300 wide):
  campaigns (current checked; others "closes <current> first") · New
  campaign… · Import campaign XML… · Close campaign · Library ›.
  Library: the word "Library"; if a campaign is open, a "Back to <name> ●"
  small button at the right.
- Spacer.
- Console only: layout button (`.btn.sm.gh`: layouts icon, current layout
  name, `Ctrl+n` kbd; if the screen matches no layout, "No layout") → opens
  the Layouts tool · "Hotkeys" (`Ctrl+/`) → opens the Hotkeys tool · Settings
  gear (`Ctrl+,`) → Library › Settings · dock toggle (`.ib`, `on` when shown).
- 1 px divider, then window controls, 40 px each, muted glyphs.
Everything except buttons is `-webkit-app-region: drag`.

### 2.2 Live strip (42 px, `bg-rail`, 1 px `border` above)
Table-time state only, plus the one-tap actions. Never the mark, never a name.
Sections (`.sec`, 1 px `border` right, padding 0 10, gap 6):
1. **TV**: monitor icon · accent pip + "Live: <scene>" (600, truncates at
   170) or "Blackout" in `warn` · Blackout (`.btn.sm`, `pri` when on) ·
   player-window icon button (`on` when open) · undo-scene icon button.
   Click on the text opens TV controls.
2. **Combat**: shield · "Round 3 · Aria" (600) / "Set initiative" / "No fight"
   (muted) · previous, next turn icon buttons (next is `pri`; both `dim` when
   no fight). Click on the text focuses the Combat tab (opens it if closed).
3. **Music**: note · "<playlist> · <track>" (600, 190 max) / "Muted" in
   `warn` / "No music" · prev, play/pause, next · panic mute (`pri` when
   muted). Click on the text opens Music.
4. **Dice**: cube · the shared pool as compact chips (26 px, count badges) ·
   Roll (`pri`, small) · clear (row action ×) · last total (18 px mono).
   Click on the cube opens Dice.
At 1366 the music title truncates first, then the scene title. Nothing wraps.

## 3. Stage

Area between top bar and strip, left of the dock. Padding 8, gap 8.

### 3.1 Groups
1 or 2 tab groups side by side (`.grp`: `bg-panel`, 1 px border, radius 14,
overflow hidden). Two is the ceiling. Each group: tab strip 34 px
(`.tabs`, `bg-rail`, 1 px border below) then the content.
- Split: drag a tab past the midline of the stage → dashed accent drop zone
  over the right half ("Split right"), or the ⧉ button at the strip's end.
  Divider 8 px (`.div`), drag to resize; default 50/50.
- Merge: close the last tab of a group, or drag its tabs back.
- Maximize (⤢, Ctrl+Shift+M): the focused group fills the stage, the other
  group is hidden, the dock collapses to icons. Restore brings both back.
- Focus: a group has keyboard focus; N/P, Ctrl+K etc. act on the focused
  group where it matters. The focused group's strip is not decorated; the
  active tab's accent line is enough.

### 3.2 Tabs (28 px, `.tab`)
- Idle: muted label. Hover: `bg-hover`, × appears at right.
- Active: `bg-panel`, full text, 1 px border, 2 px accent inset top line.
- Live: accent pip before the label (Map when its scene is on the TV; Combat
  during a fight). Live tabs can be closed; the strip's section brings them
  back.
- Unsaved changes: hollow ring after the label (see Decisions 12).
- Close: × on hover; state is kept (search, selection, scroll, open record,
  encounter). Reopen from + or by the strip.
- Order: drag within a strip.
- Strip end (`.tabend`): **+** (menu of the majors not open in either group;
  disabled when all are open; to move a tab between groups, drag it) · ⧉
  split right · ⤢ maximize / restore.
- Too many: labels drop from least-recently-used tabs first (icon-only,
  28 × 28, tooltip), never from the active or a live tab; what still does
  not fit folds into a ⋯ button with a count. Never a horizontal scroll.
- Ctrl+K: opens/focuses Compendium in the group **not** holding Combat (or the
  only group) and focuses its search.

### 3.3 Majors
All render inside a group's content box: `bg-panel`, padding 10 × 12 unless
noted, nothing scrolls sideways; titles truncate.

**Campaign** (`Campaign.dc.html`): name + "2024 rules" badge + ⋯ (Import into
this campaign…); Party (cards with pip, name, player · class level, mono
stats HP · AC · Init · PP; Edit / Remove row actions on hover or selection;
New PC card); Quick add (disclosure: hint, textarea, Add PCs); Adventures,
NPCs, Notes each with "No … yet." + one add action.

**Compendium** (`Compendium.dc.html`): kind segment (Monsters … Classes);
filter row that wraps: search (220, focused style), All sources, edition,
CR range as one control ("CR ¼ – 5", opens from/to), type, size,
environment, NPCs and monsters; results 300 wide (name, CR, type, size,
edition badge, count line "12 results · 0.6 ms"); record card (2024 stat
block layout: name, edition + source badges, Switch edition ("Legacy"),
Duplicate to homebrew; AC/Init/HP/Speed; 6-ability grid with mod / save;
skills, senses, languages, CR line; Actions, Bonus actions… as prose; spell
names are links; Back returns). `homebrew` mode replaces the record card with
the light editor (Decisions 11).

**Encounters** (`Encounters.dc.html`): list view (rows: name, combatant count,
"fought n×", Open, Delete; New encounter) and the builder: Back to list, name
input, table (combatant, count input, role segment ally/enemy/neutral, remove),
Add all PCs + per-PC buttons (dim when in), Add creature search with a picker
popover (`.fly`: name, CR, type, edition, Enter), difficulty card ("Enemy XP
275", "Moderate" badge, budget hint) and **Start combat** (primary).

**Combat** (`Combat.dc.html`): header (Round n · turn name; Normal/Adv/Dis
segment; before start: Roll remaining (n), Sort, Begin; during: previous
icon, "Next turn N" primary, End combat icon). Initiative rows 36 px
(`.ir`, 3 px left rule ally/enemy/neutral, active row accent border, selected
row `bg-active`): init field (empty → "roll"), name, masked-name badge,
hidden / holding / concentrating / condition badges, HP "28/44" mono with
"+5 temp", death-save pips on a downed PC, move up/down row actions.
Inspector for the selected combatant (`.cd`): name, AC · init, masked badge;
icon toolbar Reveal, Hide, Hold, Mark dead, Remove; damage row (amount, type,
Damage primary, Heal, Temp HP); condition row (condition, duration, Add
condition); concentration row; counters / recharges and spell-slot pips
(click to spend, again to restore); stat block with action buttons (attack
rolls to hit and damage; multiattack; feature rolls; save calls) or "PC card:
no stat block. Ask the player." Inline prompts (`.pr`, warn border, never
modal): concentration under the affected row; save call under the caster's
row (DC, ability, per-target results, Apply full / half, Dismiss); rolled
damage under the action that produced it (to-hit and damage with dice shown,
target buttons, Half, Dismiss). Several may be open at once; the active turn
row **pins** at the top of the list while the rest scrolls. Log: wide layout
= right column 300 (entries prefixed R n, export, hide); narrow = collapsed
row under the list ("Log · 14 entries", export, hide). Wide ≥ 900 px = three
columns (list 340 | inspector | log 300); narrow = stacked.

**Map** (`Map.dc.html`): header (map icon, scene name, "live" badge, grid ·
zoom · party position; Send to TV, dim when already live; pencil → Scenes
edit); vertical tool strip 36 px (zoom in/out/fit; align grid, place party,
entry markers, find creature; token hidden/masked/dead; player camera,
presets; linked encounter — menu: Start combat from these tokens · Resume
<encounter> · Forget the link); canvas with grid, players'-view dashed
rectangle, entry-marker pins, 26 px tokens (ally blue, enemy red, masked "?",
hidden dashed, dead grey), tooltip on hover, zoom and grid kbd chips bottom
right. Empty state when the selected scene is not a map or blank grid:
sentence + New map… / New blank grid.

### 3.4 Dock (right; `.dock`, `bg-rail`, 1 px border left, padding 8, gap 8)
States: wide 400 · narrow 300 · icons 44 · hidden 0. Drag the left edge:
snaps at 300 and 400, below 200 → icons. Hidden via the top-bar toggle.
- **Tab strip** 34 px (`DockTabs.dc.html`): six toggles (`.ib`, `on` when the
  section is open; accent pip when live: TV when a scene is live, Music when
  playing, Scenes when a scene is live); spacer; ⇥ collapse to icons. Icons
  state: the same six vertically, with ⇤ expand at the top; a tap opens the
  tool as a **flyout** (`.fly`, 384 wide, header + body) beside its icon.
  Hidden state: Ctrl+D / Ctrl+T / Ctrl+M and the strip's section clicks open
  the flyout anchored above the strip's matching section. Escape closes a
  flyout. Only one flyout at a time.
- **Sections** (`.pn.dsec`): header 34 px (`.dh`: icon, name, pip, optional
  inline summary, collapse chevron); body. Collapsed = header only; a
  collapsed Music header shows the track name and a pause button. Order is
  the strip's order; drag headers to reorder. The last open section takes the
  remaining height and scrolls inside; headers never scroll away.
- Bodies at wide are 382 px wide, at narrow 282. Compact variants: dice
  chips 26 px, tighter rows; nothing is dropped at narrow.

### 3.5 Minors
**Dice** (`DockDice.dc.html`): pool chips d100 → d4 (34 px; on = accent
border + 16 % fill + count badge; click adds, right-click removes); modifier
stepper; Normal/Adv/Dis (Adv/Dis enabled only for a lone d20); Clear; Roll
primary with the expression; result 26 px mono + faces line; "Or type" field
+ Roll typed; Roll log (Decisions 9): total, source badge, expression, faces,
time; Clear. The pool is one object shared with the strip.

**TV controls** (`DockTV.dc.html`): live card (accent border: "Live on TV",
"window open" badge, scene name · kind · title shown); Blackout, Close/Open
player window, undo icon, Dismiss handout icon (dim when none), End break
icon (dim when none); Overlays checkboxes 2 × 2 (Scene title, Initiative
strip, PC health bars, Round counter); Handout (title, text, Show text
handout primary, Show image handout…; ring when typed and not shown); Break
(title, minutes, Show break screen).

**Music** (`DockMusic.dc.html`): now playing (title 16/600, "artist ·
playlist · n of m"); transport prev / pause-play (`pri`) / next / stop; Panic
mute / Unmute; position slider with times; Master and Music sliders;
crossfade seconds; output device select; "Measuring loudness: n tracks
left"; Playlists (new name + Add; rows with playing pip, count · length,
Rename and Play playlist row actions; the selected playlist's ordered
tracks with grip, index, remove); Tracks (search, kind segment All / Music /
Ambience / Effect, rows: title, tag badges, length, loudness badge, Play now
and Add to… row actions on hover).

**Scenes** (`DockScenes.dc.html`): Find scene; new-scene row (title input +
icons: title card, image scene…, map…, blank grid, folder); tree (folders
collapsible, rows with kind icon, title, "live" badge, row actions ▶ send /
edit / up / down on hover or selection); Recent links; selected card (accent
border when live: "Selected · live", name, Send to TV, Open in Map, Edit
disclosure); edit form (Title, Subtitle, Folder, Show title on TV, Music on
go-live, Backdrop, DM notes, Remove scene). Hover preview: a `.fly` card
(280 wide, thumbnail + kind · folder · "Enter sends") floating over the stage
beside the row.

**Hotkeys** (`DockHotkeys.dc.html`): the fixed table, kbd chips in mono.

**Layouts** (`DockLayouts.dc.html`): name input + "Save current as new"
(primary); hint line; rows (`.cd`, current has accent border + "current"
badge): kbd Ctrl+n, a 44 × 24 glyph of the arrangement, name, summary;
row actions on hover or when current: Overwrite, Rename, up, down, Delete;
"Bring back the starter layouts" + explanation. Starter set: Prep, Table,
Combat (see §6).

## 4. Sizes

1600 × 900: top 34 · stage/dock row 824 · strip 42. Group height 808; group
content 772 (808 − 34 − 2). Dock sections area 766 (824 − 16 − 34 − 8).
Widths with dock 400: stage inner 1184 (Prep: Compendium group 780 +
Campaign 396); dock 300: 1284 → two groups of 638 (content 636), or one of
1284; dock 44: 1540; hidden: 1584. Section body widths: 382 / 282.

1366 × 768: row 692, group 676, content 640. With the dock at icons the two
groups are 649 (content 647). Strip and top bar are 1366 wide.

Rule: when the stage is split and the window is narrower than 1400, a narrow
dock is shown as icons; the layout still records "narrow" and still counts as
current (matching is judged against the layout's intent, not the trimmed
result). Expanding is one click and does not change the layout.

The compendium filter row wraps to two or three rows below ~900 px of group
width; the combat header (7 controls) fits at 600; the transport row fits at
282.

## 5. Keyboard

The fixed table from `FEATURES.md`, with: Ctrl+K as in §3.2; Ctrl+M opens or
focuses the Music tool (section or flyout); Ctrl+D, Ctrl+T likewise;
Ctrl+Shift+M as in §3.1; Ctrl+1–9 apply layouts (console only); Escape
closes the open flyout, then any open menu; N/P are ignored while a text
field has focus. Tab order: top bar → stage groups (tabs, then content) →
dock → strip.

## 6. Layouts

A layout captures chrome only:

```json
{ "name": "Table", "hotkey": 2,
  "stage": { "groups": [ { "tabs": ["map","campaign","encounters"], "active": "map" },
                         { "tabs": ["combat","compendium"], "active": "combat" } ],
             "split": 0.5, "maximized": null },
  "dock":  { "state": "narrow", "width": 300,
             "sections": [ { "tool": "tv", "open": true },
                           { "tool": "scenes", "open": true },
                           { "tool": "music", "open": false } ] } }
```
Not captured, on purpose: what is live, the fight, what is playing, the pool,
any tab's contents. Applying: tabs the layout names are summoned into their
groups; tabs it does not name stay where they are in group 1; the strip does
not move. The current-layout highlight (and the top-bar name) holds while the
screen still matches; any change drops it, and Overwrite is the way to keep
it. Starter layouts: Prep = Compendium ⧉ Campaign, dock wide: Dice, Hotkeys ·
Table = Map ⧉ Combat, dock narrow: TV controls, Scenes · Combat = Combat
maximized, dock icons.

## 7. Flows to verify

1. Start of session: Library › Open → console; Scenes: select title card,
   Enter → live; TV controls: open player window; Music: Play playlist. Strip
   shows all four.
2. Exploration: send a map; Map: place party at an entry marker; drag tokens
   (mirrored); TV controls: Show image handout; Blackout for a break.
3. Combat from a map: Map's link tool → Start combat from these tokens →
   Combat tab opens in the other group (Table layout) with initiatives rolled
   or waiting; per turn: select creature, click an attack, apply rolled
   damage to a target, add a condition, Next turn; End combat keeps the log
   with the encounter.
4. Lookup mid-combat: Ctrl+K → Compendium in the non-combat group; read;
   click the Combat tab back; nothing reset.
5. Dice anywhere: click chips in the strip or Dice; Roll; the total shows in
   the strip, Dice and, if from the tracker, the log line.
6. Close with something live: switcher › Close campaign → warning → Stop
   sharing and close → Library; reopen → console as it was.
