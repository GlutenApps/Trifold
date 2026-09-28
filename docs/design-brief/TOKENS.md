# Trifold design tokens (fixed)

Palette "Slate and bone": near-monochrome slate surfaces, warm bone as the only accent, so ally, enemy, healthy, bloodied and down carry all the colour. `tokens.json` has the same values for import.

## Colour, dark (default)

| Token | Hex | Use |
| --- | --- | --- |
| bg | #14181D | window background |
| bg-rail | #11151A | rails, bars, docks |
| bg-panel | #1C2229 | panels, cards |
| bg-hover | #232A33 | hover |
| bg-active | #252D36 | selected, pressed, menus |
| border | #333D48 | every border |
| text | #E6E1D6 | text |
| text-muted | #9AA3AD | secondary text, icons at rest |
| accent | #E3D3B0 | primary buttons, focus, live, count badges |
| accent-contrast | #14181D | text on accent |
| danger | #E0685E | destructive, errors |
| warn | #E0B252 | conditions, bloodied, prompts |
| ok | #6FB08A | healthy |
| ally | #6FA4E0 | PCs and allies |
| enemy | #E0685E | enemies |

Health bar: healthy #6FB08A → bloodied #E0B252 → down #E0685E.

## Colour, light

| Token | Hex |
| --- | --- |
| bg | #F3F0E8 |
| bg-rail | #EAE6DC |
| bg-panel | #FFFDF8 |
| bg-hover | #E6E1D6 |
| bg-active | #DDD6C7 |
| border | #CFC7B5 |
| text | #1F2429 |
| text-muted | #5C6670 |
| accent | #7A6430 |
| accent-contrast | #FFF8E6 |
| danger | #C2483F |
| warn | #A87A18 |
| ok | #3F8A5E |
| ally | #3B75B8 |
| enemy | #C2483F |

## Type

- UI: Outfit, weights 400 and 600. Base 13 px, line height 1.4. Panel titles 13 px/600, section labels 12 px/600 muted, big numbers (dice totals, round) 26 px mono.
- Numbers, dice, codes, initiative, hotkeys: IBM Plex Mono 400/500.
- Sentence case everywhere. No all-caps except tiny section labels (11 px, letter-spacing 0.06 em).

## Shape and size

- Radii: panels 14 px, buttons and inputs 10 px, small controls 6 px, badges pill.
- Buttons 30 px tall (small 26, primary same height), icon buttons 28 px, row actions 22 px shown on hover/selection, dice chips 34 px (tray 26 px), tabs 28 px.
- Panel header 34 px; status bar 42 px; rail 64 px wide; gutters 8 px; panel padding 10 × 12 px; card padding 12 px; row gap 6 px.
- Borders 1 px `border`; focus ring 2 px `accent` inset; live and selected states use an `accent` border; a focused-but-idle panel is `border` only.
- Shadows only on floating things (menus, drag ghosts): 0 8 24 rgba(0,0,0,.35).

## Existing component looks (keep)

- Initiative row: 3 px left rule in ally or enemy colour, active row gets an accent border, HP as `28/44`, badges for hidden / holding / conditions.
- Dice chip: mono label, accent border and 16 % accent fill when in the pool, accent count badge top-right.
- Tab-like segments (Normal / Adv / Dis): joined buttons, pressed one filled with accent.
- Empty states: one muted sentence plus the one action that fixes it.
