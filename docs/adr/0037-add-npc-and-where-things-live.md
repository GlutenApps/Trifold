# ADR 0037 · One Add NPC, and "This campaign" or "All campaigns"

**Status:** accepted, 2026-11-14. Amends `DESIGN.md` §6.2 (the words of the Save step and the
campaign creature page) and §6.3 (adding NPCs).

## Context

An NPC is two things: the character (name, role, location, notes, alive, carried HP), which
always lives in the campaign, and an optional stat block, which can live in the SRD or an
imported file, in the DM's homebrew (every campaign), or in the campaign's own creatures (ADR
0035). The screens never said which layer they showed or where a stat block lived:

- The NPC row's **Open in compendium** jumped from the character to its stat block, where a
  campaign creature then offered **Add to my compendium**.
- "Compendium" meant two things: the Compendium tab (everything the open campaign sees,
  campaign creatures included) and "my compendium" (homebrew only).
- **From another campaign…** listed characters only, so a named creature in the compendium
  could not be added from there, and nothing on the NPCs tab said where a stat block lived.

## Decision

1. **One Add NPC.** The NPCs tab has one plus, **Add NPC**, opening a panel in the tab with
   **Start a blank NPC** and a search over either **Other campaigns** (their NPCs, copied as
   today, ADR 0036 bringing the stat block when needed) or the **Compendium** (any creature, with
   **Named characters only** to narrow it). The panel says what each does.
2. **A compendium creature becomes a named NPC with its own stat block.** Picking one makes an
   NPC under the creature's name and copies its stat block into this campaign's creatures under
   the same name, marked named, with `basedOn` pointing at the original. The DM can then change
   the character's stat block without touching the original. A creature that is already one of
   this campaign's own is linked as it is. Linking an existing stat block from the NPC form is
   unchanged, for the many minor NPCs that share a generic one.
3. **One pair of words for where something lives: This campaign and All campaigns.**
   - The Save step's **Keep it** offers *This campaign only* ("Listed only while <campaign> is
     open") and *All campaigns* ("Kept in your homebrew"); the widest **Use it** choice reads
     *Every Goblin in this campaign*.
   - A campaign creature's page offers **Use in all campaigns** in place of Add to my
     compendium.
   - Campaign creatures' source pill reads **This campaign** (only the open campaign's ever
     show).
4. **The NPC row says where its stat block lives**: a pill, *Stat block: This campaign*,
   *Stat block: Homebrew* or the book or file's name. The button under a shown stat block reads
   **Open stat block**.

## Consequences

- The NPCs tab loses **From another campaign…** and **New NPC** as separate buttons; the Party
  tab keeps its own, since PCs have no stat block.
- An NPC made from the compendium adds a creature to the campaign; the compendium lists it
  with the *This campaign* pill beside the original.
- `npcs.fromRecord(recordId)` joins the API.
