# ADR 0032 · The player connector joins the beta

**Status:** accepted, 2026-11-13. Amends `DESIGN.md` §10 (Beta and Later) and ADR 0029.

## Context

Later held a one-line "LAN player view": phones on the same Wi-Fi join by QR code and see the
player view in a browser, with a simple sheet to follow. The DM has since written a full spec,
the player connector (`docs/PLAYER-CONNECTOR.md`): players claim a creature from a browser page
the DM's Trifold serves on the local network, edit its HP, AC, conditions and initiative, move
its token, and spawn summons from presets, while the DM keeps authority over everything.

## Decision

- **The player connector is Beta item 14**, after XML export, built in the spec's four phases
  (connect and view; edits and reclaim; movement; spawning). It replaces the LAN player view in
  Later.
- It comes last because its server-side filtering of hidden areas leans on fog of war (Beta 7)
  and it is the largest item on the list.
- The spec is recorded with a Decisions section that settles where it and the repo disagreed:
  PC cards and non-enemy NPCs can be claimed, anything else can be summoned; no toasts; it lives
  in the VTT tab as a Player devices pop-up, not a dock tool; ports 80 then 8130–8139; players
  submit their own initiative roll once; every phase is checked on macOS too; phones get a
  map image with fog already blacked out, and only the DM changes fog.

## Consequences

- Nothing changes in code or the ground rules yet. Before Phase 1 is built, a further ADR amends
  `DESIGN.md` §1.2 (no web client) and `CLAUDE.md` ground rule 1 to allow an opt-in,
  local-network-only server the DM starts and stops, and names the packages it adds (HTTP and
  WebSocket server, mDNS responder, QR codes), none of them native.
- The beta release is Windows only (ADR 0029), but the connector is built and checked on macOS
  in every phase; only the public Mac release waits for 1.0.
