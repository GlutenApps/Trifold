# ADR 0044 · The fight is whoever is here

**Status:** accepted, 2026-11-14. Amends ADR 0005 and ADR 0012 and `DESIGN.md` §6.3 and §6.5.

## Context

Three ways to start a fight brought the party in by three different rules. From the Encounters
tab, only the PCs the encounter named joined. From a map with a linked encounter, the same,
although loose creature tokens on that map joined too: a party standing on the map was left out.
From a map with no linked encounter, every PC in the party joined, on that map or not, which
undid a split party (ADR 0022). The DM found the gap at the first table test of the player
connector, where a player's phone never asked for initiative because their PC was not in the
fight.

## Decision

One rule for every start, in `withParty` (`features/encounters/build.ts`):

1. **Started from a map, linked or not:** the PCs with a token on that map join, beside any the
   encounter names, and keep their tokens. PCs elsewhere stay out.
2. **Started from the Encounters tab:** the PCs the encounter names.
3. **When that leaves nobody from the party,** the whole party joins: an encounter naming no PCs
   and a map with no party on it almost always mean "the party".

The Set initiative step still shows everyone before Begin, and Add to fight covers anyone the
rule missed.

## Consequences

- A linked encounter started from a map now includes the party on the map; an unlinked map no
  longer pulls in PCs who are not on it.
- A monster-only encounter started from the Encounters tab now brings the party. A DM who wants
  monsters alone removes the PCs at Set initiative.
