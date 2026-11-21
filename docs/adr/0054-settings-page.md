# ADR 0054 · Settings: one column in order of use, and four settings it was missing

**Status:** accepted, 2026-11-21.

## Context

Library › Settings grew a card at a time: Library, Displays, Appearance, Sample campaign,
Backups, Updates, About. They sat in an auto-fit grid in the order they were built. That left
holes beside short cards, put a repair tool (Rebuild index) above the TV display, gave
Appearance a whole card for one dropdown, and made the Backups card's sub-headings bigger than
the card titles. Screens were listed by Electron's display id ("Display 3796784692").

Reviewing every setting Trifold stores found four things the DM had no way to do:

- make the console's text bigger or smaller;
- go back to a Library opened before (`config.json` kept the list, but nothing showed it);
- open the logs folder for a bug report;
- tell which screen is which before choosing the TV.

Some settings stay where they are used: music output, volumes and crossfade in the Music tool;
sources, 2024 books and source priority in Compendium › Sources; the table server in the VTT
tab.

## Decision

1. **One column of sections, most used first.** Each section has a heading (an `<h2>`, set in
   small capitals) and setting rows:

   | Section | Rows |
   |---|---|
   | Table display | TV screen (radios, Identify, Refresh displays) |
   | Appearance | Theme, Text size |
   | Backups | Daily backup, Back up now, Second copy, Restore (the list folds away) |
   | Updates | Check for new versions, Version |
   | Library | Library folder, Recent Libraries (only when there are others), Sample campaign |
   | Troubleshooting | Search index, Logs |
   | About | Version (Copy version info), the 5e-compatible note, Credits and licences |

   A row is the setting's name and one or two sentences on what it does, with its controls
   beside it from 640 px and under it below (ADR 0014). The page is at most 760 px wide. Jump
   links to each section sit at the top from 640 px.
2. **Credits stay visible.** The SRD attribution statements, the game-icons line, the map and
   font credits are shown in full as fine print. Only the licence texts and the icon author list
   fold, as before, so About still shows the attribution the content policy requires.
3. **Text size** is Small, Default, Large or Extra large (zoom 0.9, 1, 1.15, 1.3 of the console
   window), kept in `config.json` because it depends on the screen. It is applied with
   Electron's zoom on the console's web contents and re-applied after every load. The TV window
   is never zoomed: tested, `file://` pages do not share a zoom level between windows.
4. **Screens are numbered** 1, 2, … from left to right (then top to bottom), named "Display 2",
   with the monitor's own name after it when the OS gives one. **Identify** opens a small window
   in the middle of each screen with its number and name for three seconds. It takes no focus.
5. **Recent Libraries** lists up to five other Libraries opened on this computer, newest first.
   Each has an open button and a remove button, which takes it off the list and leaves its
   folder. A folder that is gone shows "Folder not found" and cannot be opened. Switching
   Library now also records the one being left, so the first Library opened at startup reaches
   the list. The section hides the row when there are no others.
6. **Open logs folder** opens the Library's `logs` folder, or the app's own before a Library is
   open.
7. **Names.** The Library's folder button is **Open another Library…**, so it is not mistaken
   for the backup copy's **Change copy folder…**. "Also copy to" is now **Second copy**.

## Consequences

- The page reads top to bottom in the order a DM reaches for things, with no empty space
  between cards.
- Six small API additions: `app.textSize`, `app.setTextSize`, `app.openLogsFolder`,
  `library.recent`, `library.forgetRecent`, `displays.identify`. `DisplayInfo` gains `number`.
- `AppConfig` gains `textSize` with a default, so existing `config.json` files read unchanged.
- At Extra large on a small window, panels reach their 480 px floor sooner and fold as ADR 0014
  describes.
