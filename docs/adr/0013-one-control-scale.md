# ADR 0013 · One control scale and the UI guidelines

**Status:** accepted, 2026-11-07. Refines DESIGN.md §9 and the sizes in `docs/TOKENS.md`.

## Context

A UI audit after the encounters and map work found about 75 places where controls on one line did not match, almost none of them deliberate:

- Five control heights were in use: text buttons at 30, 26 and 22 px, icon buttons at 28 and 22 px. Text fields were about 28 px, and a second number-input rule made number fields 32 px. No two tiers matched, so any field next to any button was off by 2–4 px.
- `btn tiny` was defined twice, and the second definition added a 4 px corner. Controls had four radii (10, 6, 4 and 3 px).
- Icons inside the same 28 px button were 14, 15, 16 or 18 px depending on the file. Text went down to 9 px, and the combat reorder arrows were squeezed to 16 × 20 px.
- The same action took different forms: delete appeared as a trash icon, a close icon, "Remove" text at three sizes, with and without a confirm step.
- Local CSS patches (forced heights, margin nudges) had grown up around these mismatches.

## Decision

- **Three tiers, as tokens.** Regular 30 px for panel content, compact 26 px for window chrome, row 22 px for icon-only row actions. Buttons, icon buttons, fields, selects and icon toolbars all read `--control-h`. Chrome bars set it to the compact tier, so a control placed in them follows automatically. Icon buttons move from 28 to 30 px so they match text buttons and fields.
- **One radius for controls:** 6 px. Cards and panels keep 10 and 14 px.
- **Icon size comes from the button in CSS:** 16 px in regular and compact buttons, 14 px in row buttons and beside text. `<Icon>` defaults to 16.
- **A type floor.** 12 px for secondary text. 11 px only for keycaps and badges.
- **`btn tiny` is retired.** Row actions are icon-only `chrome-btn xs`.
- **Hierarchy comes from colour, not size.** Primary and danger mark importance. Next turn, End combat, Panic mute, Blackout and Roll stay as words. The dice Roll button stays the one deliberately taller control.
- **One pattern per common action** (delete, remove, confirm, add, back, close, reorder), and row actions hidden until hover. The DM kept the Encounters list's row actions always visible.
- All of this is written down in `docs/UI-GUIDELINES.md`, which new UI must follow.

## Consequences

- Rows line up without local height fixes, and those fixes were removed. A feature stylesheet may no longer set height, padding, font size or radius on a control.
- Panel content gets slightly roomier (28 to 30 px icon buttons). The window chrome gets slightly tighter (26 px throughout).
- Deleting a note, NPC, encounter, scene, template or layout now always asks inline first.
- A future change to sizes is a change to the tokens and the guidelines, made in one place.
