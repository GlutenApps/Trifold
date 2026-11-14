# ADR 0039 · The NPC form holds its stat block

**Status:** accepted, 2026-11-14. Extends ADR 0037 (where NPCs and stat blocks live) and ADR 0038
(the CR scaler); `DESIGN.md` §6.3.

## Context

An NPC has two layers: the character (name, role, location, notes, carried HP) and the stat
block it fights as. The NPCs tab's pencil edited only the character. To change the stat block (to
scale it, say) the DM had to show it under the row, open it in the compendium, press Edit there
and scroll to Challenge: four steps and a change of tab, where the compendium is a few clicks.

We weighed a second "Edit stat block" action beside the pencil, and decided against two edits
that look alike. The book icon keeps showing the stat block; the pencil edits both layers.

## Decision

1. **One pencil, one form.** The NPC form comes first (Required, Basics, Notes, then the Stat
   block picker), and below it the linked stat block's own sections, the same ones the compendium
   editor shows (`MonsterFields`), its name labelled **Stat block name** since it can differ from
   the NPC's (Captain Vex fights as a Bandit Captain). The CR scaler sits at the top of its
   Challenge section, as everywhere.
2. **One Save.** A changed stat block is written first, then the NPC, linked to it. If the stat
   block cannot be written, nothing is, and the form says why. An unchanged stat block is not
   written at all.
3. **Where the change goes, without a question.** A stat block only this NPC uses in this campaign
   (the rule delete uses, ADR 0037) is updated in place. Any other (SRD, an imported file,
   homebrew, or one another NPC shares, or one linked in this same form) is copied into this
   campaign under the edited name and the NPC relinked; the original never changes. A note at the
   top of the section says which before the DM edits. **Use in all campaigns** on the compendium
   page still puts it in homebrew.
4. **Carried HP follows.** When the stat block's average HP changes, the NPC's carried HP (ADR
   0012) takes the new maximum with the same share of damage: 20/27 becomes 48/65, full stays
   full, down stays down.
5. **Encounters follow.** Rows holding the NPC take its new CR, XP, HP and AC, so the builder's
   difficulty row (ADR 0038 §7) stays right; the open builder's copy is edited through its draft,
   and the loaded fight's encounter is left to the fight.
6. **Unlinking over unsaved changes asks**, inline, before the changes go.
7. **Open in compendium** (was "Open stat block") stays under the shown stat block for when the
   DM wants the compendium page itself.

## Consequences

- The NPC form is long when a stat block is linked; the stat block's sections come last, so the
  NPC's own fields stay at the top.
- `MonsterEditor` is now a form shell around `MonsterFields`, which reports the record as Save
  would write it and whether it changed; the compendium and encounter editors behave as before.
- Sticky editor headers fill the scroll pane's top padding with the background, so a scrolled
  form no longer shows through above them (seen in the Campaign tab).
