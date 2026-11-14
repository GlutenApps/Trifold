# ADR 0035 · Edit a creature where it is, choose at Save; campaign creatures

**Status:** proposed, 2026-11-15. Amends `DESIGN.md` §6.2 and the way Beta 3 (Save to
compendium) and Beta 4 (Replace references) are presented; sets where the CR scaler (Beta 8)
lives; gives Beta 5's campaign-only stat blocks their storage.

## Context

Changing a creature took four controls in three places: **Duplicate to homebrew** and **Edit**
on a record page; the builder's pencil, which only sets a label; the book icon, **Save to
compendium**, which jumped to the Compendium tab mid-fight; and a choice of how to use the copy
shown above the editor, far from the Save it belongs to. The DM had to decide where the creature
would live before changing it. A change meant only for tonight also had nowhere to live except
the Library's homebrew, beside creatures meant for every campaign.

## Decision

### 1. One Edit, where the creature is

- **Encounter builder:** on a compendium creature's row the pencil is **Edit**. It opens the
  monster editor in place of the builder, on a copy of the row's stat block with the row's label
  as its name and its HP override as its HP. Other rows (PCs, NPCs, custom) keep the pencil as
  their label, since they have no stat block. The book icon goes.
- **Tracker:** a compendium creature has **Edit**, opening the editor in the tracker's panel; the
  fight stays loaded and nothing else changes until Save. No modal (CLAUDE.md UI conventions).
- **Compendium record page:** one **Edit** on every record. **Duplicate to homebrew** goes:
  editing a record that cannot change (SRD, an imported file) always saves a new one.
- The **CR scaler** (Beta 8) is a tool inside this monster editor, wherever it is opened.
- Nothing is written until Save; Cancel leaves nothing behind.

### 2. Save asks what to keep, inline

Pressing **Save** turns the editor's header into one short step, with **Confirm** and **Back**.
It shows only the choices that apply.

- **Where it lives** (from §3):
  - **This campaign** (the default when a campaign is open): a campaign creature.
  - **My compendium**: Library homebrew, for every campaign.
  - Editing a creature that is already yours: **Update Grik** (the default) or **Save as new**.
- **Its name.** Required. In **My compendium** it may not match a record of that kind already
  there, because records with the same name share one row in the compendium and only one shows;
  the step says which record has the name and suggests another. Brackets do not make a name
  distinct (they are ignored when names are matched), so suggestions never add them. A campaign
  creature can share any name (§3).
- **Where to use it**, each with what it changes, offered only when there is something to change:
  - From a fighter: **Just Goblin 2** (it leaves its group as its own row, as Track as NPC does),
    **Every Goblin in this fight**, **Every Goblin in the campaign**.
  - From a builder row: **This row**, **Every Goblin in this encounter**, **Every Goblin in the
    campaign**.
  - From a record page: **Nowhere yet** (the default), **Every Goblin in the campaign**.

  The narrowest is the default. The edited row takes the creature's name and drops its HP
  override (the record carries it); wider choices are Replace references (Beta 4): other rows
  keep their labels and HP overrides, campaign NPCs keep their stat blocks.

### 3. Campaign creatures

- A campaign keeps its own creatures in `campaigns/<slug>/creatures/<id>.json`, one compendium
  record each, with `basedOn` provenance. They travel with campaign export and backups and go
  when the campaign is deleted.
- They are indexed as the campaign's own source and appear in the compendium only while that
  campaign is open, with the campaign's name as their source pill. They are never folded into a
  Library record's row by name, so a campaign "Goblin" neither hides nor is hidden by the SRD
  one.
- **Add to my compendium** on a campaign creature's page copies it into Library homebrew (the
  name check in §2 applies).
- A creature left unused when its encounter is deleted stays in the campaign's list, visible and
  deletable; nothing is removed on its own.
- Beta 5 uses this store for the stat blocks a campaign file brings in and for an NPC's stat block
  copied with **From another campaign…**.

### 4. Provenance and undo

- Every copy keeps `basedOn`. A CR-scaled one also records the scaling (`scaled: { fromCr, toCr
  }`), so **Changes from original** shows what the scaler did.
- A copy's page keeps the Replace references section from Beta 4 (**Replace Goblin in this
  campaign…**, **Put Goblin back…**), so a wider choice at Save is never one-way.

## Consequences

- **Removed:** the book icon, the choice banner above the editor, and **Duplicate to homebrew**.
  Their logic stays and moves behind Save: the unsaved copy (`homebrew.draft`), the row and fight
  switch, and Replace references.
- **New:** a campaign creature store and a per-campaign source in the index. Campaign rows are
  kept out of name grouping. Schema: `CompendiumRecord.scaled` (optional, additive); the
  `campaign` source kind; the campaign export already carries every file in the campaign folder.
- The monster editor gains a mode that runs inside the builder and the tracker, not only the
  Compendium tab.
- Order of work: this rework, then Beta 5 (which reuses campaign creatures), then the CR scaler
  (Beta 8) as an editor tool. Beta 3 and Beta 4 stay done; their presentation changes here.
