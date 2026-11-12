# ADR 0024 · The Library searches every campaign, keeps a fixed tray, and has one Create campaign

**Status:** accepted, 2026-11-11. Amends ADR 0017 (global search was console-only), ADR 0023
(the DM chooses the tray everywhere) and ADR 0015 (Import campaign… was its own button).

## Context

The Library had no search, so finding the campaign where a name or a phrase was written meant
opening each campaign in turn. Its tray was the console's tray, chooser included, so counters and
timers of the open campaign showed on a page that is not about any one campaign. And its header
had three buttons side by side (Import campaign…, Import campaign XML…, and a name field with
Create campaign), where "campaign XML" meant nothing to a DM who had never used Game Master.

## Decision

- **Search in the Library searches every campaign.** The same field sits in the middle of the
  top bar once the Library has a campaign, with `Ctrl+F`, the same groups (Notes, NPCs, Party,
  Encounters, Scenes, Mentioned in) and the same keys. Each row's second line starts with its
  campaign's name. The compendium and web tabs are not searched there: they open in the console.
  Main reads every campaign once per search (`campaigns.bundles`, read-only; a campaign that
  cannot be read is skipped and logged), and the open campaign's in-memory copy is used for it.
  Picking a row opens that campaign (through the same stop-sharing warning as the switcher) and
  then lands on the item with `navigate`, as in the console.
- **The Library's tray is fixed:** VTT and Music, the two things that keep running at the table
  while the DM is away from the console, then Dice. No chooser. The console's tray is kept as the
  DM chose it. Dice stays because the shared pool and the Dice pop-up have no other home, and
  `Ctrl+D` opens it from the strip button. Clicking VTT or Music text in the Library goes back to
  the console and opens that tab or tool.
- **One Create campaign button** (primary, with a plus) opens an inline panel with the three ways
  in: New blank campaign (a name and Create), Import a Trifold campaign (a `.trifold-campaign`
  file), and Import from Game Master (a campaign XML file), with a help button explaining what
  Game Master is.
- **"XML" always says whose.** Every button and file dialog that takes Lion's Den XML names
  Game Master: Import Game Master XML… on the Party tab, the campaign card and the switcher, and
  on Compendium › Sources.

## Consequences

- Search in the Library costs one read of every campaign the first time a query is typed; it is
  dropped when the field is cleared or the DM changes space, so results never go stale for long.
- Smoke specs that create a campaign click Create campaign first, then Create.
- Not done: compendium results in the Library, and a campaign filter in the results.
