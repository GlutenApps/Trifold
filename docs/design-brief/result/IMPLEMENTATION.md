# Implementation plan

Each phase ends with the app running at 1600 × 900 and 1366 × 768 and every
criterion ticked. Keep `SPEC.md` open; numbers there are the source of truth.
Existing shell: `apps/desktop/src/renderer/features/shell/`; ADR 0003 describes
the panel model this replaces.

## Phase 0 · Groundwork (half a day)
- Frameless window (`frame: false`), drag regions on the top bar, window
  controls wired; confirm snap/maximize behaves on Windows.
- Introduce the shell state model: `space` (library | console), `campaignId`,
  `stage` (groups, tabs, active, split, maximized, focused group), `dock`
  (state, width, sections with open flags, order), `layouts` (list + current
  match), `flyout`. Persist stage/dock per campaign; layouts app-wide.
- Map existing panels to majors and minors (see `FEATURE-MAP.md`). Nothing is
  deleted yet; panels are re-hosted.
Accept: window is frameless with working controls; state model has tests for
split/merge/maximize/restore and for layout capture/apply/match.

## Phase 1 · Console chrome
- Top bar (§2.1) including the switcher menu and the layout/hotkeys/settings/
  dock buttons.
- Live strip (§2.2) with all four sections, the shared pool, and click
  targets; remove the old tray/drawers.
- Stage groups with tab strips: open/close/reorder, +, ⧉, ⤢, drag-to-split,
  divider drag, overflow to icon-only and ⋯; Ctrl+K rule; state preserved
  across switches (search, selection, scroll, record, encounter, map).
- Dock with tab strip, sections, collapse, reorder, resize with snaps, icons
  state, hidden state, flyouts, Escape; last section flexes and scrolls.
Accept: all tab states from `mockups/Tabs.dc.html` reproduce; the four dock
states from `DockWide/Narrow/Icons/Hidden.dc.html` reproduce; one-tap actions
work from any tab; no horizontal scroll anywhere at 1366.

## Phase 2 · Majors and minors on the new hosts
- Majors: Campaign, Compendium (with the CR range control and the light
  homebrew editor + ring), Encounters (list + builder), Combat (narrow and
  wide layouts, pinned turn row, stacked prompts, collapsed/columned log),
  Map (split out of Presenter; tool strip; empty state; link menu).
- Minors: Dice (one log with sources), TV controls (compact layout), Music
  (transport + playlists + tracks), Scenes (tree, send-vs-select rule, hover
  preview, edit form), Hotkeys, Layouts.
- Remove Turn order; remove the Music major; remove Presenter; merge Now
  playing into Music; unify the two logs into one store with a source field.
Accept: `Prep`, `Table`, `CombatMax`, `PromptStack`, `ScenesDock`, `MusicDock`,
`StartCombat`, `HomebrewEdit` boards reproduce; flows 2–5 in SPEC §7 pass;
`FEATURE-MAP.md` walked line by line with nothing missing.

## Phase 3 · Library and campaign lifecycle
- Library space with nav and four pages; Compendium Browse/Sources/Homebrew;
  Music folders; Settings moved out of the console.
- One campaign at a time; switcher; close warning when a scene is live or
  combat is running; console state restored on reopen.
- Strip and "Back to <campaign>" in the Library while a campaign is open.
Accept: `Library*`, `CampaignSwitch`, `ClosePrompt` boards reproduce; flows 1
and 6 pass; Ctrl+, from the console lands on Settings and returns cleanly.

## Phase 4 · Layouts, sizes, polish
- Layout capture/apply per SPEC §6; starter set; current-match rule including
  the 1366 dock trim; top-bar name.
- 1366 × 768 pass on every board in `Check1366.dc.html` terms; dock overflow
  per `DockOverflow.dc.html`.
- Light theme through tokens only; keyboard tab order; tooltips on every
  icon-only control with the hotkey appended.
- Write ADR 0004 from `docs/adr-0004-stage-dock-strip-shell.md`; mark 0003
  superseded.
Accept: Ctrl+1–3 reproduce the starter boards exactly; layout highlight
behaves as specified; no control from `FEATURES.md` is unreachable at 1366.

## Do not
- Add features (hotkeys for majors, third stage group, extra minors) without
  asking.
- Use colours, radii or sizes outside `TOKENS.md`.
- Put a major in the dock or a minor on the stage, even temporarily.
- Introduce any modal other than the close warning.
