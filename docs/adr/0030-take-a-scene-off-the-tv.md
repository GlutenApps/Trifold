# ADR 0030 · Taking a scene off the TV, apart from Blackout

**Status:** accepted, 2026-11-12. Refines ADR 0008 (the TV tab) and `DESIGN.md` §6.5.

## Context

Once a scene was live, the only ways to change the TV were to send another scene or to black
out. Blackout is a curtain: it hides the scene and every overlay (initiative, timers, counters,
handouts, the break screen) and brings them all back when lifted. There was no way to end a
scene and leave the TV showing nothing but its overlays.

## Decision

- **Take off TV** ends the live scene: the TV shows its dark backdrop with the overlays still up.
  Blackout stays as it is, the curtain over everything. The two differ in what the players still
  see, so neither replaces the other.
- **Where.** On the Scenes row of the live scene, the ▶ send button becomes a ■ stop button
  (`Take <scene> off the TV`), also during a blackout. On the TV tab, Send to TV becomes
  **Take off TV** while the shown scene is on the TV. The live strip mirrors it as a stop icon
  beside Blackout (`Take the scene off the TV (tray)`). `Ctrl+Shift+X` from anywhere in the
  console.
- **Blackout lifts with it.** Taking the scene off means "nothing live, overlays up", so a
  blackout in force ends with it. That keeps Blackout's existing rule (it applies only while a
  scene is live; the TV starts blacked out with "Nothing live") without a hidden curtain behind
  an empty screen.
- **Undo.** It goes into the undo-last-scene history like a send: `Ctrl+Shift+Z` puts the scene
  back, still editable live (the history now keeps the stored scene too). Undoing back to
  "nothing live" no longer forces a blackout.

## Consequences

Presenter state needs no new field: a pulled scene is `scene: null, blackout: false`, which the
player already drew as the dark backdrop with overlays.
