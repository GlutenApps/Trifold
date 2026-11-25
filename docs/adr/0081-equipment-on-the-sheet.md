# ADR 0081 — Equipment on the sheet: equipped, attuned, where it is kept, coins, charges

**Status:** accepted, 2026-11-24. Ian's call, on the first plan from the character sheet dev list (docs/CHARACTER-SHEET.md, items 1 to 5, 20 and 21).

## Context

A sheet's items had a name, a quantity and an optional compendium link, nothing more. A player could not say what they wore, what they were attuned to or where something was kept. Coins were one gold total; PDF import folded every coin into it. AC came from a separate armour setting, so owning chain mail and a shield changed nothing.

The audit of other 5e sheets found all of these in common use. Two choices were Ian's:

- **AC:** whether equipped armour sets AC. Yes, with the armour setting kept as the fallback.
- **Storage:** whether items say where they are kept with named places or with real containers. Named places.

## Decision

- **An item can carry, all optional:** `equipped`, `attuned`, `attunement` (it needs attunement, from its record), `place`, `uses` (charges with a short, long or dawn reset) and `armor` (what it adds to AC: body armour by kind and base, or a shield). No schema bump.
- **AC follows what is worn.** Body armour and shield are each worked out on their own (`armourWorn` in `packages/rules`). Once the sheet knows an item of that kind (one with `armor`), the equipped one counts, or none. Until then the sheet's `armor` setting counts. A character made before this keeps its AC, and equipping only a shield adds it beside the old setting. The setting's "other AC bonus" still applies, and an override still wins.
- **An item learns its armour from its record** the first time it is equipped or unequipped (`toggleItem`). The sheet then works AC out without reading the compendium, so table numbers stay pure. The guided builder equips the first body armour and shield it gives, with their armour, so a new character's AC is the same as before.
- **Attunement** is offered only for items whose record needs it (read when the sheet shows them) or that are already attuned. The Equipment tab counts "Attuned N of 3", warning past three.
- **Places** are names the player gives: on the character by default, or Backpack, Mount, Home or any other. The Equipment tab groups items by place.
- **Coins:** `gp` stays gold, so old files read as before; `coins` holds platinum, electrum, silver and copper. PDF import keeps each coin as itself.
- **Charges** are pips on the item's row and under Resources. A short rest brings back short-rest charges; a long rest brings back all of them (a dawn passes during one).
- **Defences, senses and other speeds** are lists and distances on the sheet, shown in a line under the four tiles.
- **On the sheet,** Equip and Attune are quiet row toggles (ADR 0020), pressed while on. Where nothing can be changed they are words. The editor has the same fields.

## Consequences

- An unlinked item, or one whose record is gone, cannot set AC; the armour setting covers it, and the editor says when AC comes from equipped items.
- Not done: weight and encumbrance, consumables counting down, and containers that hold other items (docs/CHARACTER-SHEET.md, items 6 to 8).
