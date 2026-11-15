# ADR 0040 · The session log fills itself and closes after six quiet hours

**Status:** accepted, 2026-11-14. Builds Beta 10 (`DESIGN.md` §10) and the session log sketched in
§6.3.

## Context

A DM wants to look back over a campaign: what happened each night, how much XP the party has
earned, which NPCs are gone. Trifold already keeps each fight's result on its encounter, but
nothing ties fights, scenes and deaths to the evening they happened in, and there was nowhere to
write a recap. §6.3 asked for an entry per session day that fills itself, with the DM's recap.

## Decision

1. **One file per session**, `campaigns/<slug>/sessions/<id>.json` (file kind `session`): a title
   (empty shows *Session N*), the recap in markdown, the events, `startedAt` and
   `lastActivityAt`. The events are a fight (encounter id and name, XP, rounds, PC casualties,
   how many PCs fought), a scene sent to the TV (id and title) and a named NPC's death (id and
   name).
2. **It fills itself.** The console records a fight when it ends, a scene when it goes on the
   TV, and an NPC when it goes from alive to dead, in a fight (read back once the fight has
   written to the NPC, ADR 0012) or by hand in its form. A scene shown again, or a death already
   noted, is listed once per session. Recording never stops what caused it; a write that fails
   shows in the campaign's error banner.
3. **A session closes after six quiet hours,** not at midnight. The next event joins the most
   recently active session if it was active in the last six hours, else starts a new one. This
   deviates from "one entry per session day": a game that runs past midnight stays one session,
   and an afternoon's prep test and the evening's game become two. **New session** (+) starts
   one by hand, for a recap written before anything happens.
4. **The Sessions sub-tab** of Campaign shows the campaign's XP so far (and per PC), then the
   sessions newest first. The newest is open, the rest fold to one line (*2 fights · 450 XP · 3
   scenes · 1 death*). An open session lists its fights (XP, per PC, rounds, who fell), the scenes
   shown and who died, with a title field and the recap in the notes editor (ADR 0010),
   autosaved. Deleting a session asks first and leaves the encounters' own results alone.
5. **XP per PC** is each fight's XP divided by the PCs in it, added up; fights without PCs count
   towards the total only.
6. **Writes go one at a time.** Events, the title and the recap go through one queue and each is
   written onto the session as it is then, so a recap typed while a fight ends loses neither.
7. **Export and import.** A campaign export carries its sessions, and Import as a copy gives them
   new ids like everything else. A fresh start leaves them out, as it does other results of play.

## Consequences

- After a fight, the console re-reads PC cards and NPCs from disk, so the Party and NPCs tabs show
  the HP and deaths the fight left without reopening the campaign.
- Scenes are recorded only from the console that sends them; the player window records nothing.
- Global search does not look inside recaps yet.
