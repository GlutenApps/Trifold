# ADR 0050 · Area shapes on the map

**Status:** accepted, 2026-11-20.

## Context

Testers asked for a way to see what an area effect would hit: a cone of fire, a sphere, a line
of lightning. The map had a ruler but nothing for areas, and nothing in the roadmap covered it.

## Decision

1. **The DM draws them**, from **Area shapes** on the map's toolbar (`S`): a cone, sphere, cube
   or line, with its size in feet (15-ft cone, 20-ft sphere, 10-ft cube, 30-ft line to start).
   The point of origin snaps to the nearest grid corner and a drag aims it; a sphere centres on
   its corner. The shape stays until Escape, **Clear** or leaving the tool, and changing the
   shape or size reshapes the one drawn.
2. **Shapes follow the 2024 rules.** A cone is as wide at any point as it is far from its origin;
   a cube's origin is the middle of the face it grows from; a line is 5 feet wide; a sphere's
   size is its radius.
3. **Squares count when at least half of them is inside** (the 2024 rules' grid variant). The
   covered squares are shaded and the outline drawn over them, with the shape's name.
4. **Visual only.** A shape selects nothing and applies nothing.
5. **The TV and phones show it** while its map is live, under the fog, so fogged squares stay
   hidden. Like the ruler, a shape whose origin is under fog stays off them; the DM still sees it.

## Amendment (2026-11-21): shapes from a creature

The DM could not start a shape on a token (the token took the press), so there was no way to draw
an effect around a creature. Now the drawing tools (area shapes, ruler, fog) work over tokens, and
a shape started on a token comes from that creature:

- A **sphere** becomes an **Emanation**, the 2024 rules' shape for an effect around a creature:
  it reaches its size past the edge of the creature's space (drawn as a circle on the space's
  centre, its radius the size plus half the space), and reads "20-ft emanation".
- A **cone, cube or line** starts where the aim leaves the creature's space, as Burning Hands or
  a breath weapon leaves its caster.
- A cube's origin stays on a face; no spell needs a centred one.
- The origin dot sits on the point of origin: a cone's tip, the middle of a cube's or line's
  starting face (it was drawn on a corner).

## Consequences

- One shape at a time. The console works out the outline and squares once and every screen
  draws the same.
- Cylinders are left out: a cylinder looks like a sphere from above, so the sphere covers it on a
  flat map. Emanations come from a sphere started on a token (amendment above).
