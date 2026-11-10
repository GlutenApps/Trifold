# ADR 0021 · Timers in the dock, kept by timestamps, one on the TV

**Status:** accepted, 2026-11-10. Amends ADR 0009, ADR 0018 and ADR 0019 (a fifth dock tool, a
second item in the TV's bottom-left corner). Refines `DESIGN.md` §5.2 and §6.3.

## Context

Some table moments run on real time, not rounds: "you have 60 seconds to decide", "the guards
come back in five minutes". The DM was using a phone. Counters (ADR 0019) count presses, not
time.

## Decision

- **A dock tool, Timers**, styled like Counters (`MINOR_KINDS` gains `timers`; a saved layout
  without it gets it as a closed section). `Ctrl+Alt+T` opens it and focuses the first timer's
  main button.
- **A timer** is `CampaignTimer`: `{ name, durationSec (1 s to a day), chime (default on),
  showOnTv?, order }`, one file each in `campaigns/<slug>/timers/` (file kind `timer`, version 1),
  in backups and campaign export like any object. Only the definition is stored: whether a timer
  is running is the console's, and every timer is idle again after a restart or a campaign
  switch. A fresh-start export has nothing to reset.
- **Creating**: a name, a duration typed as `90`, `1:30`, `1:02:03`, `2m` or `1m 30s`, or picked
  from 30s / 1m / 5m, and Chime at zero. Edit opens the same form in place; a new duration applies
  from the next reset, so a countdown in progress is not disturbed.
- **Each timer**: the name and its row actions (chime, show on TV, reset, edit, delete with the
  inline confirm), quiet until the row is in use (ADR 0020); the time left and one main button,
  Start, Pause, Resume or Start again. Any number run at once. Rows drag to reorder.
- **Timestamps, not ticks.** A running timer is the moment it ends (`endsAt`), a paused one the
  time it had left; time left is always worked out from the clock (`remainingMs` in
  `@trifold/rules`), so a late or skipped redraw cannot make one drift. The tool redraws four
  times a second while a timer runs, and each running timer books a wake-up for its end, so
  reaching zero is noticed even when the tool is closed.
- **At zero** the row turns to the danger colour, pulses three times (not with reduced motion),
  says Time's up and stays at 0:00 until reset or started again; the Timers dock icon carries an
  alert pip until then. With Chime on, a short two-note tone plays once (one chime however many
  timers end together). The tone is made by the audio engine on the sfx layer, with a ramp in and
  out: no sound file ships, music is not ducked or interrupted, and the master volume and panic
  mute apply. The chime is a per-timer toggle (a bell row action, also in the form).
- **On the TV**: one timer at a time. Show on TV marks it, and marking another moves the TV to
  that one (its tooltip says which it replaces). The console sends `PresenterState.timer`
  (name, status, `endsAt` or time left) only when the timer starts, pauses, resets or changes;
  the player counts down on its own clock and turns to its alert look at zero even before the
  console has caught up. It sits large in the bottom-left corner, above the counters, in a
  shared `TvCorner` component. The TV tab's Overlays pop-up has a **Timers** switch beside
  Counters; there is no master "hide all" switch, and Blackout hides it as it hides the rest.

## Consequences

- The dock has five tools; at 900 px high the last open one scrolls inside, as before.
- Both windows read the same machine clock, so the TV and the console agree to the second.
- Not done: counting up past zero, adding time to a running timer, a timer tied to combat
  rounds, a choice of chime sounds.
