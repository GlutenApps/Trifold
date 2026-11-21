# ADR 0046 · Go live, and the active scene

**Status:** accepted, 2026-11-20. Amends ADR 0004 (sending scenes), ADR 0008 (the TV tab) and
ADR 0030 (taking a scene off the TV).

## Context

Two separate controls decided what the table saw: **Open TV** opened the player window, and
**Send to TV** put a scene on it. Phones followed the sent scene whether or not the TV was open,
so a tester's phones showed a map while the TV was closed. With phones at the table, "the TV" is
also no longer the only place a scene shows, so its wording misleads.

## Decision

1. **Go live** is one switch for the table's output (`Ctrl+Shift+P`; the VTT tab and the strip).
   Live, the TV opens and phones see the table. **End live** closes the TV, and phones say they
   are waiting for the DM. The state is session only: Trifold starts not live.
2. **The TV opens by itself where it can.** On Automatic (Settings › Displays), Go live opens the
   TV on a display that is not the primary; with one display it opens nothing and phones still
   see the table. A display chosen in Settings, the primary included, always gets the TV. A
   display plugged in while live gets the TV as Go live would have given it.
3. **Set active scene** replaces Send to TV (Enter, double-click and ▶ in Scenes do the same).
   The active scene shows at once when live; not live, it waits, so the DM can set the opening
   scene and go live when the table is ready. Its music starts when it is on air: on Set active
   scene while live, or on Go live.
4. **Clear active scene** replaces Take off TV (`Ctrl+Shift+X`, the Scenes row's ■, the strip's
   stop icon), with ADR 0030's behaviour: the overlays stay up. Blackout is unchanged, the
   curtain over everything while staying live.
5. **Phones show only what the TV shows.** Not live, the table snapshot carries no map and no
   screen and says `live: false`; the phone keeps its character tabs (so players can set HP
   before the game) and shows "Waiting for the DM to go live".
6. **Wording.** The strip reads "Not live", "Not live · Next: <scene>", "Live · no active scene"
   or "Live: <scene>"; the Scenes row and the VTT tab badge a scene "active" before going live
   and "live" on air.

## Consequences

- One rule for the TV and phones; nothing reaches the table until the DM goes live.
- A DM with one screen uses phones without a TV window, and one who wants the TV on their own
  screen (to preview, or to stream) chooses that display in Settings.
- Smoke specs that drive the TV window choose the primary display first, since CI runners have
  one display (`smoke/tv.ts`).
- Phones show the TV's overlays too, each while its switch is on: the scene title, the round
  and the initiative strip in a row along the top (the TV's own strip, folding into "+N" on a
  narrow screen), the timer and counters in the bottom-left corner on the DM's clock. They come
  from the TV's own combat summary, so names are masked and hidden creatures left out as on the
  TV. Handouts stay on the TV only while the console has no control for them.
