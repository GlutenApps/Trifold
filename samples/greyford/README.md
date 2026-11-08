# Sample campaign: The Lantern at Greyford

Source for the sample campaign that ships with Trifold (ADR 0016). A one-session adventure for
four level-3 characters (2024 rules, about 3–4 hours) written to touch every part of the app.

The text is our own and every creature is an SRD 5.2.1 record (`srd-2024`). **The maps are
2-Minute Tabletop's, under CC BY-NC 4.0**, not the repo's MIT licence: see
[images/CREDITS.md](images/CREDITS.md). They are here for pre-1.0 testing and must be replaced,
or licensed with the author's permission, before any release that is not free.

`pnpm build:sample` turns this folder into `resources/sample/greyford.trifold-campaign`.

## Layout

| Path | What it becomes |
| --- | --- |
| `campaign.json` | The campaign, adventure, PC cards, NPCs, encounters (with token cells) and the scene tree (with grids and map backgrounds). Ids are readable slugs (`npc-mara`); the build derives ULIDs from them. |
| `notes/*.md` | One note each. The front matter gives `title`, `folder` (a note folder, created on demand), `order` and `tags`. The body is the note's Markdown. |
| `maps.md` | Which image is which, how it was made, its grid, and the room keys the notes use. |
| `images/` | The maps, the handout, and `CREDITS.md`. |
| `tools/` | `make-maps.py` (originals → landscape, credited, ≤ 4096 px) and `make-handout.py`. |

## What each part demonstrates

| App feature | Where in the sample |
| --- | --- |
| Notes tree, folders, tags, search | `notes/`: Start here, Adventure, World, Sessions |
| Note templates | "Session 1 prep" follows the seeded Session prep outline |
| PC cards | Four ready-made characters |
| NPCs with stat blocks, HP carried between fights | Mara Venn (can flee the bridges and turn up in the shrine hurt), Gorm Tallow, Brother Corvin |
| Encounter builder and difficulty | Four encounters at just under Low, Moderate, Low and Moderate-to-High |
| Group initiative | Bandits, toughs, wolves, skeletons in groups |
| Allies in the tracker | Hesper Quill joins the last fight if freed |
| Add to fight mid-combat | Mara arriving in round 2 of the last fight |
| Scene tree of every kind | Title cards, village image, two maps, handout image, blank grid |
| Map backgrounds | The Wayside Lamp (Night, Day); Grey Gorge (Low water, Flood), switched during the last fight |
| Player camera on a big map | Grey Gorge is 48 × 22 squares |
| Pre-placed hidden tokens linked to encounters | The Wayside Lamp; Grey Gorge (two fights on one map) |
| Place encounter… | The shrine hall fight is placed by the DM during play |
| Music | Each scene's notes suggest a mood; the DM links their own playlists (packages carry no music) |
