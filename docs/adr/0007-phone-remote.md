# ADR 0007 · Phone audio through the laptop

**Status:** accepted, 2026-11-06. Trifold is the Bluetooth audio receiver on Windows; macOS
relies on AirPlay Receiver. A LAN remote for Trifold's own player was built the same day and
removed again as not useful: the phone's own apps are the remote.

## Context

The DM wants to play music from the phone's own apps (Spotify, a soundscape app, anything)
and hear it through the laptop, which drives the table speakers. The phone is the remote;
Trifold need not control that music at all.

- **Receiving a phone's audio is an OS job.** Windows 11 can be a Bluetooth A2DP sink; the
  OS exposes it as the WinRT API `Windows.Media.Audio.AudioPlaybackConnection`, which is all
  Microsoft's "Bluetooth Audio Receiver" Store app wraps (any phone, media only, playback
  only: the stream is not exposed as a capture device). macOS 12+ can be an AirPlay Receiver
  (iPhone and iPad only; Android cannot AirPlay), with no scriptable API and the phone
  initiating. An AirPlay receiver inside Trifold would mean embedding Apple's leaked RAOP key,
  which this repo will not do. Either way the phone's audio reaches the system's default
  output directly: Trifold's output choice, levels and panic mute do not apply to it.
- **The Windows API is reachable without native code.** Windows PowerShell 5.1, present on
  every Windows 11 machine, projects WinRT types; a script can enumerate the paired phones
  (`GetDeviceSelector` + `FindAllAsync`) and open the connection (`TryCreateFromId`,
  `StartAsync`, `OpenAsync`), which also brings up the Bluetooth link to a paired phone that is
  merely nearby. The audio flows for exactly as long as the process holds the connection
  object. Verified on the maintainer's laptop and iPhone on 2026-11-06.

## Decision

**Audio source is a top-level choice.** The Music tool opens with an "Audio source" toggle:
*This computer* (Trifold's player: transport, tracks, playlists) or *Phone*. With Phone
chosen, Trifold's player is paused, its transport and tabs are hidden, its hotkeys, scene
links and panic mute are inert, and the live strip's music section shows the phone's name,
state and one Connect or Disconnect button instead of the player controls. The choice is
remembered per machine (`config.json`, `audioSource`). Nothing connects on its own at launch,
by the DM's choice.

**Windows: Trifold is the receiver.** `src/main/phoneAudio/helper.ps1` is bundled as text
(`?raw`) and run hidden in Windows PowerShell 5.1 by `PhoneAudioReceiver`: once, briefly, to
list the paired phones, and once, long-lived, per connection; "disconnect" is killing it. The
helper reports JSON lines (connecting, connected, reconnecting, failed, with a plain-language
detail), polls the connection state every two seconds, reopens it when the phone drops out
and comes back, and exits when Trifold's process is gone. The phone panel (`PhoneAudio.tsx`)
lists phones: the ones connected before (`config.json`, `phoneAudioDevices`, most recent
first) and then the other paired ones, each with one Connect button that brings up Bluetooth
and the audio together. Pairing a new phone is a deep link into Bluetooth settings
(`app.openSystemPage`, URLs in `src/main/systemPages.ts`).

**macOS: a guide.** The phone panel is a two-step AirPlay Receiver guide with a deep link into
the AirDrop & Handoff pane; the strip says "Phone audio via AirPlay".

Both say what Trifold cannot do from there (output choice, panic mute) and point at the
system sound settings. Trifold's effects and ambience can play over the phone's music.

## Consequences

- No network listener was added; ground rule 1 ("local only") stands as written. Receiving
  Bluetooth audio is an OS feature, not a network call.
- The Windows receiver rides the same OS path as Microsoft's app, so adapters that drop with
  the app drop here too; the difference is that Trifold reconnects. It needs Windows 11 (or
  Windows 10 2004+) and Windows PowerShell 5.1 at its usual place on PATH; if PowerShell
  cannot start or the WinRT types are missing, the panel shows the helper's own message. The
  phone must already be paired and within range. Only one phone at a time; connecting another
  drops the first.
- AirPlay Receiver is unavailable on MDM-managed Macs. Deep-link identifiers for System
  Settings have changed between macOS versions before; the button disables itself when a
  page cannot open.
- Not done, and worth revisiting: bringing the phone's audio inside Trifold's mixer so levels
  and panic mute reach it. It needs native code on each platform.
