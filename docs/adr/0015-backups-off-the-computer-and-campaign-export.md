# ADR 0015 · Backups leave the computer; campaigns export on their own

**Status:** accepted, 2026-11-07. Refines DESIGN.md §4.2 and §10 M1 item 8 (backups).

## Context

Trifold writes a daily zip of the Library into `Library/backups/`. That guards against a bad
edit or a corrupt file, but not against losing the computer: the backups sit on the same disk
as the data they protect. Restore only lists zips in that folder, so on a new computer there
is nothing to restore from. Restore also extracts over the Library and leaves files the zip
does not hold, so restoring to a date before a campaign was deleted gives a mix of old and
new rather than that date's state.

A campaign cannot leave its Library on its own. A DM handing a campaign to a co-DM, moving
one campaign between Libraries, or running the same adventure for a second group has to copy
folders by hand and reset play state by editing JSON.

Ground rule 1 still holds: Trifold makes no network calls of its own. A folder that a cloud
sync app watches is just a folder to Trifold; the user's sync app does the uploading.

## Decision

### What a backup holds

Everything the Library holds, which is everything the DM can add or adjust: campaigns
(notes, NPCs, PC cards, encounters, scenes with their images, token art and **token
positions**), a fight in progress (round, turn, HP and **conditions**), HP carried between
fights (ADR 0012), homebrew, custom art, note templates, imported sources, the music
library's tags and playlists, and settings including workspace layouts and web tab
addresses.

Left out, as before: the search index (rebuilt from files), logs, earlier backups, and audio
files (referenced in place). Also left out: `config.json` in the app's data folder (open
Library, recent Libraries, window position, phone audio devices), which describes one
computer, and web tab logins, which belong to the browser session.

Map and fight edits reach disk within half a second of being made. Before writing a backup,
the console flushes any save still waiting on its timer, so a backup taken mid-fight has the
last change.

**Music is not relinked.** On a new computer the restored music library lists tracks whose
files are missing; the DM adds their music folders again as on a fresh install. There is no
path-remapping tool.

### A second location

The Backups card gains **Also copy to** with **Choose folder…** (the OS folder picker) and
**Stop copying**. The chosen path is stored in `config.json`, not in the Library: a drive
letter or a sync folder path only means something on one computer, and a restored Library
must not try to write to a folder that is not there.

- After every daily and manual backup, the zip is copied to
  `<folder>/Trifold backups/<Library folder name>/`, written as `.partial` and renamed when
  complete. The subfolder keeps two Libraries that share a destination from pruning each
  other's zips. Pre-restore safety zips stay in the Library only.
- The destination keeps the last `keepDays` daily and manual zips plus the newest zip of each
  of the last 8 weeks. Pruning there never touches a file whose name does not match the
  backup pattern.
- The card shows when the last copy was made. When the folder cannot be reached (a drive
  unplugged, a permission denied), the backup still completes in the Library, the failure is
  logged, a banner says so once per session, and the card shows the problem until a copy
  succeeds. When the last successful copy is more than 3 days old, the card says so.
- Copy is one folder, not a list. UI copy describes it as "a folder on another drive, or one
  your cloud sync app keeps" and names no service.

Trifold also backs up **on close** when this session wrote to the Library after the newest
backup, so a session's work leaves the computer the same evening rather than the next day it
is opened. There is one on-close zip a day (`<date>-quit.zip`), replaced at each close, so it
always holds the day's last state. Closing the console, by its window button, the menu or
Cmd+Q, runs one flow: the console writes every save still waiting on a timer, the windows
hide, the zip is written (given up after a minute), and the app quits.

### A manifest in every zip

Each zip gains `manifest.json`:
`{ kind: "library" | "campaign", appVersion, librarySchemaVersion, campaignSchemaVersion,
createdAt, counts }`. Restore and import read it first:

- a zip from a newer schema than this app knows is refused with "Made by a newer Trifold";
- an older one restores and is migrated on open, as any older file is;
- the confirmation shows what the zip holds ("3 campaigns, 41 homebrew records, Nov 2");
- a zip without a manifest (made before this ADR) restores as before.

### Restore from anywhere

- **Settings › Backups › Restore from file…** picks any zip with the OS file picker.
- **On a new computer** Trifold opens an empty Library in Documents as on any first launch;
  Restore from file fills it from the newest zip in the copy folder. There is no separate
  first-run screen. To restore somewhere else, change the Library folder first.
- Restoring over an open Library **replaces** it: after the safety zip is written, every
  top-level folder and file the zip holds is cleared and then extracted, so the result is the
  backup's state. Folders the zip does not hold (`backups/`, `logs/`) are left alone.

### Campaign export

**Export campaign…** is an icon button on each campaign's card in Library › Campaigns; it
opens the options inline in the card, not in a modal, and **Export…** then asks the OS save
dialog where to write `<campaign name>.trifold-campaign`. **Import campaign…** sits in the
page header beside Import campaign XML, and what the file holds shows in a panel below it
before anything is written.

The file is a zip: `campaign/` (campaign.json, one JSON file per PC, NPC, note, adventure,
encounter and scene, and the `images/` and `tokens/` media), `homebrew/` for the records it
carries, an optional `layout.json`, and a `manifest.json` with `kind: "campaign"`, the
campaign's id and name, its PC count and the options it was made with.

| Option | Choices | Default |
|---|---|---|
| State | **As it is now** · **Fresh start** | As it is now |
| Party (PC cards) | on · off | on |
| Homebrew this campaign uses | on · off | on |
| Console layout | on · off | off |

**As it is now** copies the campaign folder unchanged, including a fight in progress with
its round, HP and conditions.

**Fresh start** keeps everything the DM wrote or built (adventures, notes, scenes, maps,
**token positions**, encounter setups, NPC details) and resets what play changed:

- PC current and temp HP cleared (full);
- NPC carried HP cleared and every NPC alive;
- fights in progress ended without a result, so their conditions go with them;
- encounter results and fight logs dropped;
- the active adventure cleared;
- tokens' dead flags cleared.

The four outcomes this gives:

| | Party on | Party off |
|---|---|---|
| **As it is now** | Move or hand off a campaign in progress | Hand it off without the PC cards |
| **Fresh start** | Run it again with the same pregenerated PCs | Run it for a new group |

Always true of an export:

- **Imported sources are never bundled.** Records from them are referenced by key, and the
  panel says how many ("23 creatures come from imported sources and are not included; they
  appear if the other Library has those sources"). Bundled SRD records always resolve.
  Bundling would hand a user's imported compendium to whoever receives the file.
- **Homebrew this campaign uses** means records referenced by NPCs, encounter templates,
  combatants in a saved fight, and tokens.
- **Music references are removed**: scene playlists and ambience point at another Library's
  music.
- With Party off, links and tokens that named a PC keep their cached names and show as
  missing, as any deleted target does. A PC's portrait is left out too, unless something kept
  (an NPC, a token) uses the same picture.
- Pending saves are flushed first, so the open campaign's last edits are in the file.
- **Console layout** is this campaign's entry in the Library's workspace settings.

**Import** adds a campaign. When the Library already holds a campaign with the same id, the
import asks: **Replace** (a backup is written first) or **Import as a copy** (new ids
throughout, remapped in every reference, "(copy)" on the name, the next free slug). Replace
is how a co-DM takes an updated version; it writes a pre-restore backup, clears the campaign's
folder and writes the file's version in the same place. A homebrew record whose id already
exists in the Library and differs is not overwritten; the Library's version is kept and the
import summary says so. References that do not resolve are counted in the summary, never an
error. A Library backup picked here is refused with a pointer to Settings › Backups, and a
campaign export picked there is refused the other way.

The Fresh start transform, the reference walk and the re-id for copies are pure functions in
`packages/importers` (`campaign/exportPackage.ts`) with an SRD-only fixture; the main process
(`campaign/campaignPackage.ts`) only reads, zips and writes. The export options are a schema
(`CampaignExportOptions`) because the manifest stores them.

**Autosaves that land late.** The encounter builder saves per encounter, so switching
encounters, Back or closing the panel lets the last edit land instead of dropping it; such a
save writes only while the encounter is still in the open campaign and not in a fight.
Deleting an encounter or starting its fight cancels its waiting save. Fight notes have one
save slot that ending the fight writes first, so no note lands after the result.

### Not done

- Uploading to a cloud service from inside Trifold (ground rule 1).
- Encrypting backups; the Library holds no secrets. A password option could come later.
- More than one copy location.
- Relinking music after a restore.
- Keeping the Library itself in a synced folder is not recommended in the UI. Moving
  `index.sqlite` to the app's data folder so a synced Library syncs only its JSON is a
  separate decision.

### Open question

Conditions last only as long as a fight. A PC who leaves a fight poisoned or with a level of
exhaustion starts the next one clean, so no backup can hold that state between fights.
Carrying conditions the way ADR 0012 carries HP (on PC cards and NPCs, cleared by Long rest
and Restore, round-based durations dropped when the fight ends) would be its own change.

## Consequences

- `AppConfig` gains the copy folder and the time and outcome of the last copy.
- `LibraryStore` records the time of its last write so close can tell whether a backup is due.
- `BackupService` gains the manifest, the copy and its pruning, restore from a path, and
  replace-mode restore. The merge-mode test now expects replacement.
- Every renderer autosave that waits on a timer (combat state, the open scene, layouts, note
  and template editors, the encounter builder, fight notes) goes through one registry,
  `stores/pendingSaves.ts`, so Back up now, restore and close can flush them all.
- A failed copy shows on the Backups card until a copy succeeds, and as a banner once per
  session (the app has banners, not toasts).
- The smoke test picks a copy folder, backs up, restores that copy from file, exports the
  campaign as a fresh start without the party, imports it back as a copy, and checks that
  closing wrote the on-close zip.
- `packages/api` gains `backups.chooseCopyFolder`, `stopCopying`, `copyStatus`, `chooseFile`,
  `restoreFile`, `app.savesFlushed` and the `flushSaves` and `backupCopy` events; campaign
  export adds `campaigns.exportPreview`, `exportTo`, `choosePackage` and `importPackage`.
- DESIGN.md §2 gains a row pointing here.
