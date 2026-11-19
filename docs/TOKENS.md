# Design tokens

Palette "Slate and bone": near-monochrome slate surfaces, warm bone as the only accent, so ally, enemy, healthy, bloodied and down carry all the colour. The CSS custom properties in `apps/desktop/src/renderer/styles/global.css` are the source; this page lists them. Features use the tokens, never literal colours (see [UI-GUIDELINES.md](UI-GUIDELINES.md)).

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
| accent | #C5BEAF | primary buttons, focus, live, count badges |
| accent-contrast | #14181D | text on accent |
| danger | #E0685E | destructive, errors |
| warn | #E0B252 | conditions, bloodied, prompts |
| ok | #6FB08A | healthy |
| tally / tally-contrast | #D9453A / #FFF6F4 | the on-air tally: the TV is open and players can see it |
| fight / fight-contrast | #C47A74 / #1F0E0C | a fight in progress (an encounter's pill) |
| ally | #6FA4E0 | PCs and allies |
| enemy | #E0685E | enemies |
| damage-tint / -edge / -ink | #2A1C1D / #A8463F / #F0958C | Damage on the player page |
| heal-tint / -edge / -ink | #182A20 / #3F7D58 / #8FD3A8 | Heal on the player page |
| temp-tint / -edge / -ink | #1B2A3A / #36506B / #9CC6F0 | Temp HP on the player page |
| cond-tint / -edge / -ink | #3A2F1A / #C99A45 / #F6D38C | An active condition on the player page |

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
| accent | #1C2229 |
| accent-contrast | #F3F0E8 |
| danger | #C2483F |
| warn | #A87A18 |
| ok | #3F8A5E |
| tally / tally-contrast | #C2362C / #FFF6F4 |
| fight / fight-contrast | #D9A39D / #4A1712 |
| ally | #3B75B8 |
| enemy | #C2483F |
| damage-tint / -edge / -ink | #F8E4E1 / #C2483F / #9A2F27 |
| heal-tint / -edge / -ink | #E2F1E7 / #3F8A5E / #2B6643 |
| temp-tint / -edge / -ink | #E1ECF7 / #3B75B8 / #285A90 |
| cond-tint / -edge / -ink | #F6ECD3 / #A87A18 / #6E4F0C |

The light theme's accent is the brand's slate rather than a darkened bone, so selection and primary buttons read as slate on paper.

## The TV's palette

The player window and the console's map canvas ignore the console theme. Their colours are fixed tokens in both themes: `--tv-*` for scene backdrops (dark, parchment, stone), the ink on each and the scrims behind overlays; `--token-*` for token faces and edges; `--fog-mist` and `--fog-hatch` for fog; `--ruler` and `--ruler-casing` for the measuring ruler.

## Type

- UI: Outfit, weights 400 and 600. Base 13 px, line height 1.4. Panel titles 13 px/600, section labels 12 px/600 muted, big numbers (dice totals, round) 26 px mono.
- Numbers, dice, codes, initiative, hotkeys: IBM Plex Mono 400/500.
- Sentence case everywhere. No all-caps except small section labels (12 px, letter-spacing 0.06 em).

## Shape and size

- Radii: panels 14 px (`--radius-lg`), cards 10 px (`--radius`), every control (buttons, icon buttons, fields, toolbars) 6 px (`--radius-control`), badges pill.
- Control scale (see [UI-GUIDELINES.md](UI-GUIDELINES.md)): regular 30 px for buttons, icon buttons and fields (`--control-h`); compact 26 px in window chrome (`--control-h-compact`); row actions 22 px, icon-only, always on screen and quiet until their row is in use (`--control-h-row`, `--quiet`). Icons 16 px in icon buttons, 14 px in rows and beside text. Dice chips 34 px (26 px in the compact tray), tabs 28 px.
- Top bar 44 px; tab strips and panel headers 34 px; live strip 42 px; gutters 8 px; panel padding 10 × 12 px; card padding 12 px; row gap 6 px.
- Borders 1 px `border`; focus ring 2 px `accent` inset; live and selected states use an `accent` border; a focused-but-idle panel is `border` only.
- Shadows only on floating things (menus, drag ghosts): 0 8 24 rgba(0,0,0,.35).

## Component looks

- Initiative row: 3 px left rule in ally or enemy colour, active row gets an accent border, HP as `28/44`, badges for hidden / holding / conditions.
- Dice chip: mono label, accent border and 16 % accent fill when in the pool, accent count badge top-right.
- Tab-like segments (Normal / Adv / Dis): joined buttons, pressed one filled with accent.
- Empty states: one muted sentence plus the one action that fixes it.
