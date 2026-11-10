# Trifold documentation

Start here. Each document has one job; when two disagree, `DESIGN.md` wins on product decisions and `../CLAUDE.md` wins on code conventions.

| Document                                   | Read it when                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| [USER-GUIDE.md](USER-GUIDE.md)             | You are the DM: installing, first launch, every tool, hotkeys, backups, troubleshooting.                                    |
| [DESIGN.md](DESIGN.md)                     | You want to know what the app is and why. §2 is the decision log, §6 the module specs, §10 what shipped and what remains.   |
| [DATA-FORMATS.md](DATA-FORMATS.md)         | You are touching an importer, a schema or a file in the Library: every XML convention, JSON format and index table.         |
| [UI-GUIDELINES.md](UI-GUIDELINES.md)       | You are adding or changing UI: control tiers, patterns for common actions, panel widths (ADR 0013, 0014).                   |
| [DEEP-LINKS.md](DEEP-LINKS.md)             | You are opening one feature's item from another (search, note links): the `navigate` contract and how a panel lands it.    |
| [TOKENS.md](TOKENS.md)                     | You need the palette, type and size tokens behind `global.css` (`tokens.json` has the same values for tools).               |
| [RELEASING.md](RELEASING.md)               | You are cutting a build: content fetch, icon, version, tag, the release workflow, what to check on each platform.           |
| [../CLAUDE.md](../CLAUDE.md)               | You are writing code: ground rules, stack, repo layout, commands, conventions, definition of done.                           |
| [../CHANGELOG.md](../CHANGELOG.md)         | You want to know what changed between versions.                                                                             |
| [design-brief/](design-brief/README.md)    | Historical: the September 2026 shell redesign brief and its result. Frozen; kept as the record behind ADR 0004.              |

## Architecture decision records

One short file per decision that deviates from or refines `DESIGN.md`. Number them in order; each has context, decision and consequences; add a row to the decision log in `DESIGN.md` §2 when the decision changes a product-level choice.

| ADR                                                              | Decision                                                                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [0001](adr/0001-electron-and-native-module-pins.md)              | Electron and better-sqlite3 are pinned together to versions with prebuilt binaries; no compiler on install.     |
| [0002](adr/0002-hash-routes-for-windows.md)                      | The console and player windows are routed by URL hash.                                                           |
| [0003](adr/0003-dm-screen-workspace.md)                          | The console is a DM-screen workspace of panels (superseded by 0004).                                             |
| [0004](adr/0004-stage-dock-strip-shell.md)                       | Library space plus a per-campaign console: tabbed stage, right dock, live strip; Slate and bone palette.         |
| [0005](adr/0005-encounters-hosts-combat.md)                      | One Encounters tab hosts the builder and, while a fight runs, the tracker; encounters can be placed on a map.    |
| [0006](adr/0006-macos-and-windows.md)                            | One codebase for Windows and macOS; platform code limited to build, menu, title bar and the primary modifier.   |
| [0007](adr/0007-phone-remote.md)                                 | Phone audio: Windows is the Bluetooth receiver via a PowerShell helper; macOS gets an AirPlay Receiver guide.    |
| [0008](adr/0008-tv-tab.md)                                       | The TV tab (titled VTT) shows the selected scene and holds every screen control; the strip only mirrors.         |
| [0009](adr/0009-popup-tools.md)                                  | Dice, Hotkeys and Layouts pop up from their buttons; the dock keeps the tall tools and is never hidden.          |
| [0010](adr/0010-notes-tree.md)                                   | Campaign notes are a tree of folders with autosave, templates and phrase search; folders replace adventures.    |
| [0011](adr/0011-web-tabs.md)                                     | Web tabs: an address the DM typed, in a sandboxed webview, saved with the layouts.                                |
| [0012](adr/0012-fights-carry-over.md)                            | HP carries between fights for PCs and named NPCs; the tracker drives the map; identity-only token links.        |
| [0013](adr/0013-one-control-scale.md)                            | One control scale and one pattern per common action; `UI-GUIDELINES.md` is the rulebook.                        |
| [0014](adr/0014-panel-floor-and-folding.md)                      | Panel floors (480 px stage, 360 px dock), folding order, and one set of layout switch points.                    |
| [0015](adr/0015-backups-off-the-computer-and-campaign-export.md) | A second backup location, restore from any zip, and `.trifold-campaign` export and import.                       |
| [0016](adr/0016-bundled-sample-campaign.md)                      | A sample campaign ships with the app and every Library gets it once.                                             |
| [0017](adr/0017-global-search-and-deep-links.md)                 | Global search in the middle of the top bar, over one deep-link contract that every panel implements.             |
| [0018](adr/0018-quick-notes.md)                                  | Quick notes: a dock tool and Ctrl+N that file titled notes in a Quick Notes folder found by its role.            |
