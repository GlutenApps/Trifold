# ADR 0042 · Sub-tabs fold into More, in table-time order

**Status:** accepted, 2026-11-15.

## Context

With Rules (ADR 0041) the Compendium has nine kinds. Its sub-tab row scrolled sideways once it
overflowed, so in a normal panel the last tabs sat out of sight; the DM took Rules for missing.
At the panel's 480 px floor (ADR 0014) almost half the row was hidden.

## Decision

1. **A sub-tab row never scrolls.** The tabs that fit show in their order; the rest fold into a
   **More ▾** tab at the end of the row, a menu of the folded kinds. The open tab always shows,
   even when it comes late in the order. Tabs fold strictly from the end, so the order holds.
   Each tab's width is measured, not estimated, so the row folds as late as it can.
2. **The Compendium's kinds are in the order a DM reaches for them at the table:** Monsters,
   Spells, Conditions, Rules, Items, then the character-building kinds, Classes, Feats, Species,
   Backgrounds. At 480 px the first five show and the four character-building kinds are in More.
3. One `SubTabs` component does this, for other sub-tab rows to use as they grow.

## Consequences

- The tab row's sideways scrolling and its mouse-wheel handling are gone.
- A kind in More is one click further away; the order puts only prep-time kinds there.
