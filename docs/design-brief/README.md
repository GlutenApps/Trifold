# Design brief: stage, dock and toolbars

> **Historical.** This is the 2026-09-28 brief and the design result that produced ADR 0004. The shell has moved on since (ADRs 0005, 0008, 0009, 0012, 0013, 0014) and nothing here is maintained; the screenshots show the pre-0004 shell. The palette moved to `docs/TOKENS.md`; the feature inventory for users is `docs/USER-GUIDE.md`.

A self-contained pack for redesigning the console shell in a design tool (written for Claude Design, 2026-09-28). Nothing here changes the app; the result comes back as a mockup and is implemented afterwards.

What to hand the design tool:

1. Paste `PROMPT.md` as the prompt.
2. Attach `FEATURES.md`, `../TOKENS.md`, `../tokens.json`, `../brand/svg/mark-on-dark.svg` and everything in `screenshots/`.
3. Optionally attach the earlier palette mockup (`SlateBone.dc.html`) if the tool accepts it; `TOKENS.md` already carries its values.

Screenshots, all at 1600 × 900, dark theme, from the current build:

| File | What it shows |
| --- | --- |
| `prep.png` | Prep layout: compendium search beside the campaign; status bar with the dice pool |
| `table.png` | Table layout: presenter with a live title card, combat tracker and campaign stacked |
| `drawer.png` | The dice drawer expanded from the status bar |
| `max.png` | Combat tracker maximized with inspector and log |
| `dice.png` | Dice panel and status-bar pool showing the same selection |
| `layouts.png` | The layouts drawer |
| `dnd-mid.png` | Dragging a panel: the drop silhouette and ghost chip |

When the mockup comes back, bring it into this folder as `result/` and open a session to implement it; the current shell lives in `apps/desktop/src/renderer/features/shell/` and is described in `docs/adr/0003-dm-screen-workspace.md`.
