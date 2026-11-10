# UI guidelines

How Trifold's console looks and why. Read this before building or changing any UI. The rules exist so a row of controls lines up without local fixes, and so a difference in size always means a difference in importance. ADR 0013 records how we got here.

Colours, fonts and the palette are in `docs/TOKENS.md`; the CSS tokens live in `apps/desktop/src/renderer/styles/global.css`. Never use a literal colour, size or radius where a token exists. (The player window's scene backdrops are the one place literal colours are allowed.)

## 1. The control scale

Every button, icon button, text field, number field and select takes its height from one of three tiers. All controls on one line use the same tier.

| Tier | Height | Token | Where |
|---|---|---|---|
| Regular | 30 px | `--control-h` | Panel content: toolbars, headers, forms, the combat bar, drawers, pop-up bodies |
| Compact | 26 px | `--control-h-compact` | Window chrome: top bar, tab strips, dock and pop-up headers, live strip, web bar |
| Row | 22 px | `--control-h-row` | Actions inside a list row; icon-only |

The chrome bars (`.topbar`, `.tabs`, `.dock-tabs`, `.dh`, `.fly-head`, `.strip`, `.web-bar`) set `--control-h` to the compact tier, so a plain `btn`, `chrome-btn` or input placed in them is compact automatically. Do not add a new chrome bar without adding it to that list in `shell.css`.

| Class | Gives you |
|---|---|
| `btn` | Text button at the current tier (30, or 26 in chrome) |
| `btn small` | Compact text button (26) inside panel content. Use it only for an inline confirm strip, a segmented choice inside a drawer or pop-up, or a hint action in an empty state. Never mix it with regular controls on one line. |
| `chrome-btn` | Square icon button at the current tier |
| `chrome-btn xs` | Row-tier icon button (22) |
| `icon-toolbar` | A bordered group of `chrome-btn`s, exactly one control tall |
| `seg` | Joined text buttons (segmented choice); all the same class |

`btn tiny` is retired. Do not add it back.

**No local overrides.** Never set `height`, `min-height`, `padding`, `font-size` or `border-radius` on `.btn`, `.chrome-btn` or a field in a feature stylesheet. If something does not fit, the fix is a layout change or a change to this document and the scale, not a one-off. Width is fine (`input.narrow`, a fixed-width number field).

**The one taller control:** the dice pop-up's Roll button (`.roll-btn`, 36 px) is the hero action of its tool and is deliberately bigger. Anything else that wants to be bigger needs an ADR.

## 2. Hierarchy

Importance comes from colour and placement, not from mixing sizes.

- **Primary:** `primary` (accent fill). At most one per group: the action the group exists for (Damage, Next turn, Send to TV, Create).
- **Danger:** `danger`. Destructive actions and End combat.
- **Secondary:** plain `btn` or `chrome-btn`.
- **Table-critical text buttons.** These stay as words, never icons, because the DM must read them at a glance during play: **Next turn**, **End combat**, **Panic mute**, **Blackout**, **Roll**. They take the tier of the bar they sit in.
- Chrome (compact) is quieter than content (regular), which is quieter than nothing: that is the intended reading order.

## 3. Icons or words

- Prefer an icon button with a `title` tooltip and a matching `aria-label` (name the target: `Remove Goblin`, not just `Remove`).
- Use words when the action has no clear icon, when it is table-critical (above), or when it is a form submit (Create campaign, Add PCs).
- Within one group, use one or the other. A toolbar of icons with one text button in the middle is a mistake unless that button is primary or table-critical.
- Show hotkeys through `hk()` in the tooltip, never as literal text.

## 4. Icon sizes

Set by CSS from the button, never at the call site. Do not pass `size` to an `<Icon>` inside a button.

| Context | Size | Token |
|---|---|---|
| `chrome-btn` (regular or compact) | 16 px | `--icon` |
| `chrome-btn xs` | 14 px | `--icon-row` |
| Icon beside text in a `btn` | 14 px | `--icon-text` |
| Standalone icon in a list row or label | 14 px (pass `size={14}`) |
| Decorative chevron or tab close | 12 px minimum |

`<Icon>` defaults to 16. Never type a glyph (`×`, `−`, `+`, `▲`, `▼`, `✕`) where an icon exists; use `<Icon name="close|minus|plus|up|down">`.

## 5. Type

| Size | Use |
|---|---|
| 11 px | Only keycaps (`.kbd`) and badges (`.badge`, count badges on chips, token order numbers) |
| 12 px | Secondary text (`.small`, `.muted.small`), compact buttons, section labels, counts, meta |
| 13 px | Body text, regular buttons, fields (the base) |
| 16 / 18 / 22 px | Note titles / campaign and page titles / the stat-block name |

Nothing goes below 11 px. Muted text uses `--text-muted`, which keeps about 6:1 contrast in both themes; do not lower it with `opacity`.

**Section headings** inside a panel are `<h2>` (12 px, 600, muted). Sub-sections use `<h3>` (13 px, 600). Do not use `<strong>` or a styled `<span>` as a heading. No `<h1>` inside a panel (ADR 0003); only Library pages carry one.

## 6. Shape

| Thing | Radius |
|---|---|
| Every control: buttons, icon buttons, fields, selects, toolbars | 6 px (`--radius-control`) |
| Cards, panels, banners | 10 px (`--radius`) / 14 px (`--radius-lg`) |
| Chips, badges, pips | pill (`999px`) |

## 7. Click targets

Nothing clickable is smaller than 20 × 20 px, and anything used during combat is at least the row tier (22 px). Small visuals (a tag chip's ×, a tab's close) get a target of at least 16 px inside a larger chip, preferably 20.

## 8. Rows and lists

- **Row actions are always on screen, quiet until the row is in use** (ADR 0020). Wrap them in `.row-actions`: they rest at the `--quiet` opacity and come up to full when the row is hovered, holds focus or is selected; the rule is in `responsive.css` and covers every list, so never hide or reveal actions per feature. A toggle that is on (`aria-pressed`) stays full, so its state reads at rest; use that instead of a separate status badge.
- **No exceptions:** every list uses the same quiet actions, the Encounters list included (it used to pin its actions at full strength). Each action keeps its place on every row: when one does not apply (Delete for the fight in progress), it stays in its slot, disabled, with a `title` that says why, rather than disappearing and shifting the others. A disabled icon button is grey, at the fainter `--disabled` opacity, with a not-allowed pointer, so it never passes for a quiet one.
- Row actions are `chrome-btn xs`, icon-only. A row that needs words for its action (Restore, Show) is a sign the action belongs in the selected item's inspector, or it gets a `title` and an icon.
- Rows of the same kind look the same everywhere: if PC rows have row actions, NPC rows do too.

## 9. Common actions

One pattern each. Reuse these; do not invent a variant.

| Action | Control |
|---|---|
| **Delete** (destroys data) | `trash` icon, `danger`, then the inline confirm |
| **Remove from a list** (the thing survives elsewhere: a track from a playlist, a combatant from a fight, a folder from the music scan) | `close` icon, no confirm |
| **Inline confirm** | Use `<InlineConfirm>` from `features/shell/InlineConfirm.tsx`; never hand-write one. The row's actions become one line: muted "Delete *name*?", `btn small danger` **Delete**, `btn small` **Keep**. Pass `verb` when the action is Remove or Restore, and `question` when the consequence needs saying ("Overwrite the Library with this backup?"). Keep takes focus; Escape or Keep cancels. No dialogs. Deleting a whole campaign keeps its stronger type-the-word confirm. |
| **Add** | `plus` icon button (`primary` when it is the panel's main action) in the header. When the add must say what it adds (Add action, Goblin Warrior), a `btn` with a `plus` icon and the words. A text submit when it needs a typed name (Create campaign). Never a typed `+` in a label. |
| **Back** | `left` icon `chrome-btn` at the start of the header, `title="Back to …"` |
| **Close** a pop-up, flyout or drawer | `close` icon `chrome-btn xs` at the end of its header |
| **Edit** | `pencil` icon |
| **Start / play / resume** | `play` icon in a row; `btn primary` with words in a header (Start combat, Send to TV), always the same tier for the same action |
| **Reorder** | `up` / `down` icons at row tier (22 px each), or drag; never squeezed |
| **Dismiss** an error banner | `btn small` **Dismiss** |

## 10. Panel widths and layouts

ADR 0014 records how these came about.

- **The floor.** A stage panel is never narrower than 480 px, and a dock tool is never narrower than 360 px. The shell guarantees both (`PANEL_MIN`, `DOCK_MIN` in `stores/shellLayout.ts`). Build every panel to work from its floor up, with no sideways scrolling at any width.
- **The shell decides what fits.** When the window narrows, the dock folds to icons first, then two stage groups fold into one stack. Features never need to know about this.
- **Switch points.** A panel's own layout gains a column only at **640** or **960** px, written as `@container panel (min-width: …)` or `(width < …)`, and only when every column then gets the room its content needs. No other panel-level breakpoints. The `panel` container is the panel's content box (24 px of padding inside the panel edge), so a 480 px panel has about 454 px of content, and "960" switches when the panel itself is about 984 px wide.
- **Window chrome** (top bar, live strip, Library nav) responds to the window with `@media` at 1180 or 960 px, shedding what has another home first.
- **Inner parts follow their own width.** A results list, a row or a drawer that has to adapt declares its own container (`container: results / inline-size`) and queries that, not the panel. Example: the compendium list hides its type and size columns when the list is narrow, whatever the panel's width.
- **Secondary content is a strip, not a column.** A log or summary that is usually short sits across the bottom (collapsible) rather than taking a full-height column.
- **List and detail below 960 px:** show the list or the detail, not two short scrolling boxes. Selecting opens the detail with a `left` "Back to …" button; going back keeps the query, filters and scroll position. Campaign Notes (below 640) and the compendium (below 960) work this way.
- **One scroll per panel when stacked.** In a one-column layout the panel scrolls as a whole; avoid fixed-height boxes that scroll separately.
- **Check it** at 480, 640, 960 and a wide width, and for a dock tool at 360.

## 11. Checklist for new UI

1. Every control on each line uses one tier; no `height`/`padding`/`font-size`/`radius` overrides on controls.
2. Hierarchy comes from `primary` / `danger`, at most one primary per group.
3. Icon buttons have `title` and a target-naming `aria-label`; no `size` on icons inside buttons; no typed glyphs.
4. No text below 12 px except keycaps and badges.
5. Row actions are `chrome-btn xs` inside `.row-actions`, always on screen and quiet until the row is in use (ADR 0020).
6. Delete, remove, add, back, close and confirm follow section 9.
7. Colours and radii come from tokens. Native controls (checkboxes, radios, sliders), selected text, `<mark>` and the fallback focus ring take the accent from `global.css`; never leave a browser or system colour showing.
8. Headings are `h2` / `h3`; no `h1` in a panel.
9. Works from 480 px (360 px for a dock tool) with no sideways scrolling; layout switches only at 640 or 960 (§10).
10. Check it in both themes, at 1366 × 768, and at half of a 1920 screen.
