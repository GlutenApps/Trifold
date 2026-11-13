# ADR 0033 · Creature art replaces bulk art matching

**Status:** accepted, 2026-11-13. Amends `DESIGN.md` §6.8 and §10 (Beta 12).

## Context

Beta 12 was bulk art matching: pick a folder, match files to records by filename. Matching "to
records" assumed art can belong to a creature, but it cannot: Set art… paints one token, and the
next copy placed gets the generated icon again. The DM wants to change a goblin's art once and
see it on every goblin, and a place to see which creatures still need art. Set art… also keeps
the full original plus a copy up to 4096 px for a picture drawn at a few hundred pixels, and
every daily backup zips all of it again.

## Decision

- **One feature, Creature art**, in Beta 12's place, with two halves:
  - **Set art…** on a token asks **This token** or **Every <name>**. Art for a compendium
    creature is Library-wide, in `art/<kind>/<recordKey>.png` (planned in §4.2, never built);
    art for a PC or NPC stays in its campaign's `tokens/` folder. It shows on every token of
    that creature and on its compendium page, PC card or NPC. A token's own art wins.
  - **Images** in the Library: a mini compendium of everything that can be a token
    (compendium creatures including homebrew, every campaign's PCs and NPCs) with search and
    filters for needs art, type, source and campaign; add, replace or remove per row; Add from
    folder is the old bulk match, with its preview of matches and misses. Other kinds get no art.
- **Shrink on the way in.** Every image added for art is fitted to 512 × 512 and saved as PNG,
  which keeps transparency; the original is not kept. Set art… for one token uses the same size.

## Consequences

- Backups stay small: about 150–400 KB per creature, so 400 creatures add roughly 60–160 MB to a
  zip instead of gigabytes. Map images keep their original and 4096 px copy as before.
- Art a token already has from Set art… keeps working; nothing is migrated.
- Campaign export carries the art of the creatures the campaign uses, as it does homebrew.
