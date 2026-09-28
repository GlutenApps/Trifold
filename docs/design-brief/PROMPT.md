# Trifold console: rethink the shell around a stage, a dock and toolbars

You are redesigning the console window of **Trifold**, a local Windows desktop app a Dungeon Master runs at the table for 5e-compatible games. The DM has a laptop (the console) and a TV the players see (the player window, driven from the console). Everything below is about the console only.

Read `FEATURES.md` (every feature and control the design must house), `TOKENS.md` (palette, type, sizes; these are fixed), and look at `screenshots/` (what exists today). `logo.svg` is the mark.

## The problem with today's shell

Today every feature is a panel. The rail on the left opens a panel, and each panel gets its own column or stack; the DM can drag, resize, maximize and save layouts. A bottom "tray" holds the small tools (dice, music transport, TV controls, turn order) with expandable drawers.

It works, but it has a flaw: opening anything, even a small tool like Music, splits the screen and squeezes everything else. Big things and small things compete for the same space, and the DM has to keep re-arranging.

## The model to design toward

Think Adobe (Photoshop, Premiere, Lightroom) or a good IDE:

1. **A stage** that holds the *major* work: campaign, compendium, encounter builder, combat tracker, presenter (scene tree + map), music library, settings. The stage has **tabs**, so switching between majors is a click and nothing loses its place (scroll position, selection, draft edits all survive).
2. **A dock** for the *minor* tools: dice pool and roll log, TV controls (blackout, player window, overlays, handout, break screen), the turn order and next/previous, now playing and transport, the hotkey sheet, the layouts list, a scene preview, notes. The dock also has **tabs** (or stacked collapsible sections), and it can be narrow, wide, collapsed to icons, or hidden. Minor tools never take space from the stage beyond the dock's width.
3. **Toolbars** for reaching things: a top bar (or a slim icon strip) with the majors, global actions and status; contextual toolbars inside a major (for example the map editor's tools).

Adapt the model rather than copying it. A DM at the table is not a designer at a desk: they glance, they tap, they must never lose the live state.

## Hard requirements the design must satisfy

- **One case where two majors must be visible at once:** running combat while moving tokens on the map. Solve it (split stage into two tab groups, a pinned second stage, a "table mode" that pairs combat with the presenter, or something better). This is the single most important flow in the app.
- **Table-time state is always visible** without opening anything: what is live on the TV (scene title, blackout), whether the player window is open, combat round and whose turn it is, what music is playing and whether audio is muted, the last dice total. Today's bottom bar does this; keep the job, not necessarily the bar.
- **Blackout, panic mute, next turn and open/close player window** are one tap or one keypress from anywhere.
- **No modal dialogs during combat.** Prompts (concentration save, save calls, rolled damage waiting for a target) appear inline where the DM is looking.
- **Dice are a pool you build by clicking** (d4 to d100 chips with count badges, a modifier, advantage/disadvantage for a lone d20, Roll), shared between wherever it appears.
- **Keyboard first.** Every table-time action has a hotkey (list in `FEATURES.md`). Show where the hotkey sheet lives.
- **Layouts are the DM's:** save the current arrangement by name, overwrite, rename, reorder, delete; `Ctrl+1` to `Ctrl+9` apply them. Show how a layout is captured in your model (which tabs are open, dock state, split).
- **Panels remember their place.** Switching a tab must not reset a search, a selected record, an open scene or an in-progress encounter draft.
- **Compact.** Base type 13 px, buttons 30 px, icon buttons 28 px, per-row actions 22 px and revealed on hover or selection. Prefer icon toolbars with tooltips over rows of text buttons. Titles truncate with an ellipsis; nothing scrolls sideways.
- **Window sizes:** design at 1600 × 900 and check 1366 × 768; the console may also be dragged onto a 1080p TV-sized second monitor while the player window is on the other.
- **Palette, type and mark are fixed** (see `TOKENS.md`): "Slate and bone", Outfit for UI text, IBM Plex Mono for numbers and codes. Dark is the default; a light variant exists.
- **Local app, no accounts, no cloud.** No sign-in, sync, share or collaboration affordances. No trademarked book names anywhere; say "5e-compatible".

## What to deliver

1. **The shell:** stage, dock and toolbar anatomy at 1600 × 900, with the dock in each state (wide, narrow, icons only, hidden) and the stage split for the combat + map case.
2. **Four screens in that shell:**
   - **Prep:** compendium open with a stat block, campaign party visible somewhere, dice in the dock.
   - **Table:** presenter with a map scene live, combat tracker beside it, TV controls and turn order in the dock, music playing, an inline concentration prompt showing.
   - **Combat, maximized:** the tracker alone with the stat block and log, a rolled-damage prompt waiting for a target.
   - **Music library:** folders, tracks, playlists, transport; show how "now playing" stays visible after leaving this tab.
3. **Tabs and switching:** what a stage tab and a dock tab look like idle, active, live (the tab whose content is on the TV or in combat), with an unsaved draft, and when there are too many to fit.
4. **Layouts:** where the list lives and how saving and applying feel.
5. **A short rationale** (half a page): what changed from today's panel model, what was kept, and the trade-offs, especially for the two-majors-at-once case.

Where `FEATURES.md` lists a control, keep it: nothing may be dropped, but anything may be regrouped, hidden behind an obvious disclosure, or turned into an icon with a tooltip.

## What not to do

- Do not redesign the player window (the TV). Only the console.
- Do not invent game content, book names or licences; use the placeholder names in `FEATURES.md`.
- Do not add features. If something seems missing, note it in the rationale instead.
- Do not restyle: no new colours, fonts or radii beyond `TOKENS.md`.
