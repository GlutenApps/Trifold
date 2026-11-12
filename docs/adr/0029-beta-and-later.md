# ADR 0029 · Beta and Later replace M2 and M3

**Status:** accepted, 2026-11-11. Amends DESIGN.md §1.2 (rulers), §2 (token art, music, fog of
war), §6.2, §6.3, §6.4, §6.5, §6.6, §6.7, §6.8 and §10.

## Context

M2 ("full v1") and M3 ("later") were written before M1 shipped. Since then a good part of what
surrounded them was built (homebrew for every kind, global search, phone audio), and the DM has
changed direction on a few items. The lists no longer said what comes next or in what order.

## Decision

- **M2 becomes Beta**: an ordered list of what the public beta adds, built top to bottom.
  **M3 becomes Later**: things that may come after the beta, and where new ideas land first.
- **Order of the beta:** Windows code signing; an opt-in check for app updates; save to
  compendium; replace references; per-campaign sources; encounter assistant; fog of war (phase 1);
  CR scaler; movement ruler; session log; rules in the compendium; bulk art matching; XML export.
- **Release phases:** an alpha on GitHub Releases (Windows and macOS, unsigned, a few testers, to
  shake out major bugs); a Windows-only beta on itch.io; macOS notarization and a public Mac
  release at 1.0. Notarization costs a yearly Apple Developer membership and only removes the
  first-launch prompt; the builds are signed ad hoc, so Mac testers get past Gatekeeper with Open
  Anyway (README) rather than a "damaged" error, and take updates from GitHub until 1.0.
- **Renamed:** "Promote to homebrew" is **Save to compendium**. "Random encounter" is the
  **Encounter assistant**.
- **Fog of war moves into the beta** as a shape mask (rectangles and polygons, snapped to the grid
  when there is one), not a painted bitmap: the map is already SVG in map pixels, so the mask is
  an SVG mask on both screens and the player state drops tokens under fog. A freehand brush and
  soft edges wait in Later.
- **The movement ruler moves into the beta**; §1.2 no longer rules out rulers.
- **Rules reference becomes a Rules kind in the compendium** (searchable, deep-linkable, one per
  edition) instead of separate DM-screen pages; custom pages are what notes are for.
- **The session log** opens itself the first time a fight runs or a scene goes live on a day,
  fills in the fights (XP, rounds, casualties), scenes shown and NPC deaths, and takes a free-text
  recap from the DM.
- **Removed:**
  - **Ambience, effects, stingers and ducking.** Phone audio (ADR 0007) is how the DM brings in
    anything beyond the music player; the app on the phone handles its own effects. The Music
    tool is complete as it stands and is not extended.
  - **`[[links]]` and backlinks in notes.** Global search (ADR 0017) already finds every note that
    names something; revisit only if DMs ask for links.
  - **Drag-and-drop art on records and PC cards.** Set art… on a token is enough; bulk matching
    covers the many-files case.
  - **Pre-fill from D&D Beyond's undocumented character endpoint.** It is unsupported, breaks
    without notice, conflicts with that service's terms on automated access, and would be a network
    call to a named site. Later instead holds importing the PDF character sheet the player exports,
    read locally, if that PDF carries form fields (verify with a real export).

## Consequences

- The music engine keeps its ambience and effects layers, the track kinds stay in the tag list,
  and scenes keep `audio.ambienceIds`, so existing Libraries load unchanged; none of them play.
- The update check needs an address to ask, which the repo rule against naming a site has to make
  room for; settle that in its own ADR when it is built. It stays opt-in and off by default.
- The LAN player view in Later would amend §1.2 (no web client) and CLAUDE.md ground rule 1 to
  allow an opt-in, local-network-only host; it needs its own design before any code.
- Signing needs accounts only the DM can open (Apple Developer Program, a Windows signing
  service); RELEASING.md changes when they exist.
