# Trifold — Data Formats and Parsing Rules

**Status:** v0.1, 2026-09-27. Companion to `DESIGN.md`.

Everything in §2 was verified against real files: the SRD compendium XML bundled with Fight Club 5e (v1.65) and Game Master 5e (v1.30), the apps' in-app import tutorials, and a 31 MB community "Complete Compendium 5.5e" file (5,034 monsters, 1,420 spells, 6,296 items, 700 feats, 276 species, 238 backgrounds, 25 classes; 109 source books). Where a rule is inferred rather than documented it is marked **(observed)**. Where it still needs a real file to confirm it is marked **(verify)**.

Test fixtures: the repo carries a small hand-written `fixtures/compendium-sample.xml` containing SRD-only records that exercise every convention below. The DM's full community file is used for local testing only and is git-ignored (see `CLAUDE.md`).

---

## 1. Overview of formats

| Format | Root | Producer | Trifold use |
|---|---|---|---|
| Compendium XML | `<compendium version="5" auto_indent="NO">` | Lion's Den apps, community | Import (all kinds), export (homebrew) |
| Campaign XML | `<campaign version="5">` | Game Master 5e export/import; Fight Club "GM export" | Import PCs, NPCs, notes, encounters |
| Open5e v2 JSON | REST API / repo JSON | Open5e | Build-time SRD snapshot |
| Trifold JSON / JSONL | see §5 | Trifold | Library on disk |
| game-icons SVG | `github.com/game-icons/icons` | game-icons.net | Build-time token art |

Parsing is **lenient** everywhere: unknown elements are kept in `data.extra` (raw XML string per element), missing elements produce warnings not failures, whitespace is trimmed, names are matched case-insensitively with punctuation stripped.

---

## 2. Lion's Den compendium XML

### 2.1 Root and record types

`<compendium version="5" auto_indent="NO">` containing any number of: `<class>`, `<spell>`, `<item>`, `<race>` (used for both 2014 races and 2024 species), `<feat>`, `<background>`, `<monster>`. The SRD file bundled with Fight Club also has top-level `<container>` records (equipment packs). Game Master's bundled files omit classes, races and feats.

Multiple `<text>` children on any element are paragraphs and are joined with `\n\n`. Text may contain literal newlines. A `<text>` starting with `Source:` is a citation line (see §2.9).

### 2.2 `<monster>`

Documented fields: `name`, `size` (`T|S|M|L|H|G`), `type` (free text, often `humanoid (goblinoid)` — subtype in parentheses; 1,957 of 5,034 records have a parenthesized subtype), `alignment`, `ac`, `hp`, `speed`, `str dex con int wis cha` (integers), `save`, `skill`, `resist`, `vulnerable`, `immune`, `conditionImmune`, `senses`, `passive` (integer), `languages`, `cr`, then repeated `trait`, `action`, `reaction`, `legendary`, each with `name`, one or more `text`, optional `attack` (repeatable), optional `recharge`.

Undocumented fields **(observed)**: `init` (integer initiative bonus; 554 records, almost all 2024), `description` (lore paragraphs ending in a `Source:` line; present on 5,033 records), `environment` (comma list, may be empty; e.g. `underdark, urban`), `spells` (comma list of spell names), `slots` (comma list, see §2.7), `sortname` (e.g. `Dragon, Ghost`), `ancestry` (grouping label such as `Dragon`, `Golem`, `Dinosaur`; 850 distinct values), `npc` (`YES` on 1,237 named NPCs from adventures), `legendary category="lair"` (lair actions, 372 records).

Field formats:
- `ac`: `17` or `15 (natural armor)` or `16 (chain mail, shield)` → `{ value: int, note?: string }`.
- `hp`: `150 (20d10+40)` → `{ average: int, formula?: string }`. Some records have only a number.
- `speed`: comma list; each entry `walk 30 ft.` or `fly 60 ft. (hover)` or `30 ft.` (bare = walk); notes in parentheses such as `(requires level 4+ spell)` or `(Wasp only)` are kept as `notes`.
- `save`: `Wis +6, Con +6, Dex +3` (three-letter ability + signed int). May be empty.
- `skill`: `Perception +10, Stealth +6`. May be empty.
- `senses`: free text (`darkvision 60 ft., blindsight 30 ft.`); capitalization varies.
- `cr`: `1/8`, `1/4`, `1/2`, `0`–`30` as strings.
- `resist`, `vulnerable`, `immune`, `conditionImmune`: free text lists; split on `,` and `;`, keep the original string too (entries like `bludgeoning, piercing, and slashing from nonmagical attacks` are one entry).
- `type`: split at the first `(`; before = type (lowercase), inside = subtype.

**Proficiency bonus (observed, 2024 entries):** a `<trait>` literally named `Proficiency Bonus` whose text is the value (`+4`). Present on 2,719 records. Remove it from the displayed trait list and store it as `proficiencyBonus`. When absent, derive from CR (see `DESIGN.md` §7.5).

**Treasure (observed, 2024 entries):** a `<trait>` named `Treasure` with the 2024 treasure-theme text. Keep it as a trait but render it under a "DM info" heading.

### 2.3 Features: uses, recharge, bonus actions, legendary and lair

`<recharge>` values **(observed)**, with meaning:

| Value | Meaning | Tracker behaviour |
|---|---|---|
| `D4`, `D5`, `D6` | Recharge on a d6 roll of N–6 | Roll d6 at start of the creature's turn; available if ≥ N |
| `1/DAY`, `2/DAY`, `3/DAY` | Uses per day | Counter, resets on long rest |
| `SHORT` | Recharges after a short or long rest | Counter of 1, resets on any rest |
| `3/TURN` (on the legendary header) | Legendary actions per round | Pool size, resets at start of the creature's turn |

Uses also appear **in names**: `Dominate Mind (2/Day)`, `Frightful Presence (Recharge 5–6)`, `Legendary Resistance (3/Day)`. Parse and strip them for display (`displayName`), and create counters from them whether or not `<recharge>` is present. Regexes:

```
uses:      /\((\d+)\/(Day|Turn|Short Rest|Long Rest|Rest)\)/i
recharge:  /\(Recharge\s*(\d)(?:\s*[–-]\s*(\d))?\)/i        → min = $1
bonus:     /\(Bonus Action\)\s*$/i                           → move to bonusActions
variant:   /^Variant:\s*/i                                    → tag feature "variant"
```

**Bonus actions (observed):** there is no `<bonus>` element. Bonus actions are `<action>` elements whose name ends with `(Bonus Action)` (686 in the community file). Names may carry several parentheticals, e.g. `Fey Step (Fey Only; Recharges after a Long Rest) (Bonus Action)`.

**Legendary actions (observed):** the first `<legendary>` element is a header named like `Legendary Actions (3/Turn)` with `<recharge>3/TURN</recharge>` and explanatory text; subsequent `<legendary>` elements are the options (some cost 2 actions, stated in the text or as `(Costs 2 Actions)` in the name → parse `/\(Costs (\d) Actions?\)/i`). `<legendary category="lair">` elements are lair actions (and regional effects), often with a header-like first entry named `<Creature> Lairs`. Split lair entries out of the legendary list into `lair`.

**Multiattack:** an `<action>` named `Multiattack`. The tracker's Multiattack button finds other action names mentioned in its text (word-boundary match against the creature's own action names) and rolls them.

### 2.4 `<attack>` triples

`label|toHit|damage`, e.g. `Bludgeoning Damage|+9|2d6+5`. **(observed)** `toHit` may be blank for save-based or automatic effects (`Psychic Damage||3d6`). `damage` may be a compound expression `(1d8+2)+(1d6)` or a plain die. The triple is also used for non-attacks: `Heal||1d10`, `Days||5d10`. Rule: a triple is an *attack* when `toHit` is present or the enclosing text matches an attack pattern (§2.5); otherwise it is a generic roll button with the label as its name. Labels in 2014 entries are usually the action name; in 2024 entries they are usually the damage type.

Dice expression grammar accepted everywhere: `NdM`, integers, `+`, `-`, parentheses, whitespace; optional `kh`/`kl` keep-highest/lowest (`4d6kh3`) for the roller only.

### 2.5 Text patterns for attacks and saves

2024 stat blocks are formulaic; 2014 blocks use the older phrasing. Both must parse.

```
2024 attack:
/(Melee|Ranged|Melee or Ranged) Attack Roll:\s*([+-]\d+),\s*(reach|range)\s*([^.]+?)\.\s*Hit:\s*(\d+)\s*\(([^)]+)\)\s*([A-Za-z]+) damage/i
  → { kind, toHit, reachOrRange, average, formula, damageType }

2014 attack:
/(Melee|Ranged|Melee or Ranged) (Weapon|Spell) Attack:\s*([+-]\d+) to hit,\s*(reach|range)\s*([^,]+),\s*([^.]+)\.\s*Hit:\s*(\d+)\s*\(([^)]+)\)\s*([A-Za-z]+) damage/i

2024 save:
/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:\s*DC\s*(\d+)/i
  Success/failure clauses follow as "Failure:" / "Success:" labels; "Success: Half damage" → halfOnSuccess.

2014 save:
/DC\s*(\d+)\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i
  "half as much damage on a successful" → halfOnSuccess.
```

Secondary damage in the same sentence (`plus 7 (2d6) Fire damage`) → `/plus\s*(\d+)\s*\(([^)]+)\)\s*([A-Za-z]+) damage/gi` appended as extra damage parts.

### 2.6 Spellcasting on monsters

`<spells>` is a comma-separated list of spell names (case varies; match by key). `<slots>` is a comma list **starting with cantrips** then slots per spell level: `0,4,3` = cantrips unlisted/at-will, four 1st-level, three 2nd-level **(observed; matches the class `slots` convention)**. 2024 blocks describe at-will / N-day spells inside a `Spellcasting` trait or action; keep the text, and use `<spells>` for lookup links. Innate spellcasting in 2014 blocks is a trait named `Innate Spellcasting`.

### 2.7 `<spell>`

Fields: `name`, `level` (0–9), `school` code (`A` abjuration, `C` conjuration, `D` divination, `EN` enchantment, `EV` evocation, `I` illusion, `N` necromancy, `T` transmutation; may be blank — 335 blank in the community file), `ritual` (`YES`), `time`, `range`, `components` (e.g. `V, S, M (a pinch of salt)`), `duration`, `classes` (comma list; 2024 entries use names like `Wizard [5.5e]`; community files also abuse this field for non-class lists such as `Maneuver Options [5.5e]`), `text` (repeatable), `roll` (repeatable, with `description` and `level` attributes for scaling), rare `modifier`, `special`.

### 2.8 `<item>`

Fields: `name`, `type` code, `magic` (`YES`/`NO`), `detail` (rarity and attunement text, e.g. `rare (requires attunement)`; also `common`, `uncommon`, `very rare`, `legendary`, `artifact`), `weight`, `value` (gold), `ac`, `strength` (min Str for heavy armor), `stealth` (`YES` = disadvantage), `dmg1`, `dmg2` (versatile), `dmgType` code, `property` codes (comma list), `range` (`80/320`), `text`, `roll`, `modifier`.

Type codes: `LA` light armor, `MA` medium armor, `HA` heavy armor, `S` shield, `M` melee weapon, `R` ranged weapon, `A` ammunition, `P` potion, `SC` scroll, `W` wondrous item, `ST` staff, `RD` rod, `WD` wand, `RG` ring, `G` adventuring gear, `$` money/treasure.
Damage type codes: `B` bludgeoning, `P` piercing, `S` slashing, `A` acid, `C` cold, `F` fire, `FC` force, `L` lightning, `N` necrotic, `PS` poison, `PY` psychic, `R` radiant, `T` thunder.
Property codes: `A` ammunition, `F` finesse, `H` heavy, `L` light, `LD` loading, `M` martial, `R` reach, `S` special, `T` thrown, `2H` two-handed, `V` versatile.
Rarity/attunement: parse from `detail` with `/(common|uncommon|rare|very rare|legendary|artifact)/i` and `/requires attunement/i`; the Android apps ignore `detail`, so community builds sometimes repeat it in `text`. Do not duplicate.
Equipment packs: `<container>` with nested `<item>` each carrying `<quantity>` (SRD file only).

### 2.9 Source citations and `description`

Every monster `description` (and many `text` blocks on other kinds) ends with a line `Source: <Book Name> p. <N>` or `Source: <Book Name>, p. <N>` **(observed; 5,033 of 5,034 monsters)**. Parse with

```
/^\s*Source:\s*(.+?)(?:,?\s*p(?:g|age)?\.?\s*(\d+[\w-]*))?\s*$/m
```

into `sourceBook` and `sourcePage`, and remove the line from the displayed text. Sources seen include the 2025 Monster Manual and 2024 core books, many 2014-era WotC books and adventures, Kobold Press books (Tome of Beasts, Creature Codex), and other third-party titles. Book names are data; they are never bundled.

### 2.10 Edition tagging

- A trailing `[5.5e]` on `name` marks a 2024 record (626 of 5,034 monsters; 727 of 1,420 spells in the community file). Strip it into `displayName`; set `edition = "2024"`.
- Names may also carry `(Legacy)`, `(UA)`, `(TP)` and similar tags in classes/subclasses; strip to `tags` (`legacy`, `unearthed-arcana`, `third-party`).
- Source book in a configurable 2024 list (e.g. `Monster Manual (2025)`, `Player's Handbook (2024)`, `Dungeon Master's Guide (2024)`) → `edition = "2024"` even without the suffix (78 5.5e monsters lack `init`; 6 non-5.5e have it — do not use `init` as the edition signal).
- Otherwise the source's default edition (community files: 2014).
- The same creature commonly exists twice (`Aboleth` and `Aboleth [5.5e]`); both share `key = "aboleth"` and are presented as one entry with an edition switch.

### 2.11 `<race>` (species)

Fields: `name`, `size`, `speed` (integer or text), `ability` (`Cha +2, Int +1` or empty for 2024 species), `proficiency`, `spellAbility`, `spells`, `languages`, `weapons`, `tools`, `armor`, `resist`, `vulnerable`, `conditionResist`, `conditionImmune`, `speedOther`, `trait` (repeatable; `name`, `text`, `roll`, `modifier`) with `trait category="species"|"subspecies"|"description"` **(observed)**, plus `displayname` and `ancestry` for grouping subraces under a parent. Trifold only browses these (no builder), so parsing is name + text + structured extras.

### 2.12 `<class>`

Fields: `name`, `hd`, `proficiency` (comma list of saves and skill options), `numSkills`, `armor`, `weapons`, `tools`, `wealth`, `spellAbility`, `slotsReset` (`L` long / `S` short), and repeated `autolevel level="N"` (optional `scoreImprovement="YES"`) containing `feature` (optional `optional="YES"`) with `name`, `text`, `special`, `modifier`, `roll`; `slots` (optional `optional="YES"`); `counter` with `name`, `value`, `reset` (`L`/`S`), and **(observed, community)** `subclass` naming the subclass the counter belongs to. Subclass features are optional features named `<Subclass>: <Feature>`; choice groups (`Fighting Style: …`, `Metamagic: …`) use the same prefix convention. Trifold stores classes for browsing only; feature grouping by prefix is implemented for display, not for a builder.

### 2.13 `<feat>` and `<background>`

Feat: `name`, `prerequisite`, `text`, `modifier`, `proficiency`, `special`, `roll`. Background: `name`, `proficiency`, `trait` (repeatable name/text/roll), `modifier`, `ancestry` (grouping) **(observed)**.

### 2.14 `<modifier>` and `<roll>`

`<modifier category="bonus|ability score|ability modifier|saving throw|skill">value</modifier>`, e.g. `ac +2`, `speed +10`, `melee attacks +1`, `ranged damage +3`, `saving throws +1`, `strength +2`. Store as `{ category, target, value }` by splitting on the last signed integer. `<roll description="Fire Damage" level="8">8d8</roll>` — `level` scales the roll by character or spell level; keep as-is.

### 2.15 Export

Trifold writes the same schema: `<compendium version="5" auto_indent="NO">`, one element per record, fields in the documented order, `text` paragraphs as separate `<text>` elements, `Source: Trifold Homebrew` appended to descriptions of homebrew. Names must be unique per kind. Records with `basedOn` pointing at a `nonSrd` source trigger the export warning (`DESIGN.md` §8).

---

## 3. Lion's Den campaign XML

### 3.1 Structure (verified against a Game Master 5e v1.30 export, 2026-09-27)

`<data version="5">` wraps a single `<campaign>` containing `<imageData>`, `<name>`, `<pc>`, `<npc>`, `<encounter>`, `<item>` and `<note>` children, in that order. No `<adventure>` element appeared in the export; the importer still accepts one (with nested `<note>` and `<encounter>`) in case other versions write it.

- `<note>`: `<name>`, `<text>`, `<expanded>0|1</expanded>`. Empty notes (`<expanded>` only) occur and are skipped.
- `<item>`: `<name>`, `<text>` (rarity and attunement as text lines), numeric `<type>`, `<weight>`, `<magic>1</magic>`, `<roll>`. Imported as a note listing.
- `<encounter>`: `<name>`, `<state>`, `<current>`, `<round>`, then `<combatant>` entries and optional `<note>` children. Each `<combatant>` wraps one `<monster>` that is either a reference `<monster><uid>818</uid></monster>` to a PC or NPC, or a full inline stat block (§3.2) with `<enemy>1</enemy>` and a table `<label>` such as `Wolf 1`. Identical inline blocks repeat per combatant; Trifold deduplicates them by key.

### 3.2 `<pc>` / `<npc>` / inline `<monster>` (Game Master native shape)

Not the compendium shape. Fields **(observed)**: `<uid>`, `<label>` (the character's or NPC's display name), `<name>` (for PCs the race/class/level string such as `Dwarf, Hill Cleric 5`; for NPCs the monster name), `<enemy>1</enemy>` on hostile NPCs, `<type>`, `<alignment>`, `<size>` numeric (0–5 = T S M L H G, absent = M), `<ac>` with `<armor>` as the note, `<abilities>14,8,15,12,18,10</abilities>` (Str Dex Con Int Wis Cha), `<hpMax>`, `<hpCurrent>`, `<hd>`, `<speed>`, `<init>`, `<savingThrow><ability>N</ability><modifier>M</modifier></savingThrow>` (ability 0–5 = Str…Cha, absent = 0), `<skill><id>N</id><modifier>M</modifier></skill>` (0-based alphabetical skill list: 0 Acrobatics … 11 Perception … 16 Stealth, 17 Survival), `<passive>`, `<languages>`, `<vulnerable>`, `<conditionImmune>`, `<senses>`, `<cr>` numeric (`-1` = 1/4, `0` = 1/2, `n` = n; omitted at the default of 1; `-2` observed on a CR 0 or 1/8 creature **(verify)**), `<environment>` bitmask (ignored), `<trait>`/`<action>` as in §2.2 except that a trait named `Source` holds the citation (`Monster Manual, p. 341`, possibly multi-line) and `<attack>` is structured: `<attack><name>Bite</name><atk>6</atk><dmg>2d10+4</dmg></attack>` (`<atk>` absent for save effects). NPC spellcasters embed `<spell>` records (numeric `<school>` 1–8 alphabetical, `<v>1</v><s>1</s><m>1</m><materials>`, repeated `<sclass>`, `<roll>`) plus `<slots>4,3,3,1,0,0,0,0,0,0,</slots>` and `<slotsCurrent>`.

Trifold rewrites these into the compendium shape (`packages/importers/src/campaign/gmNative.ts`) and reuses the monster and spell normalizers. PCs become PC cards (name from `<label>`, class and level split from `<name>`); NPCs with stat blocks get a record in a per-import source named `<campaign> (campaign file)`.

### 3.3 Fight Club "GM export"

Fight Club writes a file named `<Character Name> GM.xml` **(observed from the app binary)**: a campaign XML containing one `<pc>` stat block. It is lossy by design (no equipment, no prepared-spell state). Import it through the same campaign importer in merge mode; the PC merges by name. **(verify)** with a real export from a player.

### 3.4 Backups

Both apps write `FightClub5.backup` / `GameMaster5.backup` files that appear to contain `saveData.xml` and `saveCompendium.xml` **(verify)**. Not a v1 import target; noted for completeness.

---

## 4. Open5e (build-time SRD snapshot)

- API: `https://api.open5e.com/v2/` with endpoints for documents, creatures, spells, items, species, classes, feats, backgrounds, conditions and rules, filterable by document (e.g. the 2024 SRD document vs the 2014 SRD). **(verify)** exact document keys and pagination at build time; pin them in `resources/srd-manifest.json`. The same data exists as JSON in the `open5e/open5e-api` repository, which is the fallback if the API is unavailable during a build.
- Licenses: SRD 5.1 and 5.2.1 documents are CC-BY 4.0; third-party documents carry their own license and attribution fields, which the fetch script copies into the manifest and the About page.
- Normalization: map Open5e creature/spell/item fields onto the Trifold `Record.data` shapes in `DESIGN.md` §5.1. Open5e 2024 records are structured (species traits, feat benefits, class feature types) and need no text-pattern parsing, but the attack/save regexes in §2.5 are still run over action text to populate `Attack` and `SaveCall` for the tracker.
- The fetch script never runs at app runtime; the app has no network access in v1 except an optional "check for app updates" (GitHub Releases) that the user enables.

---

## 5. Trifold internal formats

All JSON files: UTF-8, 2-space indent, `schemaVersion` integer, ULID ids, ISO timestamps. Written atomically (temp + rename). Zod schemas in `packages/schema` are the single definition; this section is a summary.

### 5.1 `sources/<id>/source.json`
```json
{ "schemaVersion": 1, "id": "01J…", "name": "Complete Compendium 5.5e", "kind": "xml",
  "filePath": "original.xml", "fileHash": "sha256:…", "enabled": true,
  "defaultEdition": "2014", "edition2024Books": ["Monster Manual (2025)", "Player's Handbook (2024)"],
  "license": { "nonSrd": true, "attribution": null },
  "importedAt": "2026-09-27T18:42:00Z",
  "recordCounts": { "monster": 5034, "spell": 1420, "item": 6296, "feat": 700, "species": 276, "background": 238, "class": 25 },
  "warnings": ["12 monsters missing cr", "…"] }
```

### 5.2 `sources/<id>/records.jsonl`
One `Record` (see `DESIGN.md` §5.1) per line. Order = file order. Rewritten in full on re-import.

### 5.3 `homebrew/<id>.json`
A single `Record` with `sourceId = "homebrew"` and `basedOn` when duplicated.

### 5.4 Campaign folder
`campaign.json` (Campaign), `adventures/`, `notes/`, `npcs/`, `pcs/`, `encounters/`, `scenes/` each holding one JSON object per file matching `DESIGN.md` §5.2; `images/<sceneImageId>.<ext>` + `images/<sceneImageId>.display.webp`; `tokens/<id>.png`.

Scene token coordinates are in grid units (floats) relative to the grid origin (`offsetX/Y` in image pixels). Pixel position = `offset + coord × cellPx`. Footprint is in cells.

### 5.5 Music
`music/library.json`: `{ folders: [path], tracks: Track[] }`; `music/playlists/<id>.json`: Playlist. Paths are absolute. A rescan relinks a renamed or moved file to its track (same `sizeBytes` and length; tracks without a stored size match on length within the same folder; ambiguous matches are left alone), so tags, gain and playlist membership follow the file. A track whose file is gone from a readable folder is removed, along with its playlist entries. When a folder cannot be read at all (an unplugged drive), its tracks stay listed as unavailable. Kind (`music`/`ambience`/`sfx`) is edited as a tag: the first kind word among the tags (`ambience`/`ambiance`/`ambient`, `effect`/`effects`/`sfx`, `music`) sets `kind`, and a track with none is music.

### 5.6 Index (`index.sqlite`)
Derived. Tables: `records(id, kind, key, name, display_name, source_id, edition, cr, type, size, environment, is_npc, json)`, `records_fts(name, text)` (FTS5), `sources`, plus lightweight tables for campaign entity lookup. Rebuilt when any source's `fileHash` or a homebrew file's mtime changes, or when `library.json.indexVersion` is behind the app's.

---

## 6. Token art mapping tables (`resources/icons/mapping.json`)

Structure:
```json
{ "creatureType": { "undead": "skull", "fiend": "devil-mask", "aberration": "eyestalk", "construct": "golem-head",
                     "fey": "fairy", "celestial": "angel-wings", "ooze": "slime", "plant": "carnivorous-plant",
                     "elemental": "flame", "dragon": "dragon-head", "giant": "giant", "beast": "beast-eye",
                     "monstrosity": "spiked-tentacle", "humanoid": "cowled", "swarm": "insect-jaws" },
  "ancestry": { "Dragon": "dragon-head", "Golem": "golem-head", "Dinosaur": "dinosaur-rex", "Spirit": "ghost" },
  "nameKeywords": { "goblin": "goblin-head", "wolf": "wolf-head", "spider": "spider-face", "skeleton": "skeleton-inside",
                    "zombie": "shambling-zombie", "ghost": "ghost", "knight": "knight-banner", "archer": "archer",
                    "cultist": "cultist", "priest": "priest", "mage": "wizard-face", "bandit": "bandit",
                    "guard": "guard", "assassin": "hooded-assassin", "pirate": "pirate-captain", "ogre": "ogre",
                    "orc": "orc-head", "troll": "troll", "bat": "bat-wing", "imp": "imp" },
  "synonyms": { "ghoul": "zombie", "ghast": "zombie", "wight": "skeleton", "wraith": "ghost", "specter": "ghost",
                "dire": "", "young": "", "adult": "", "ancient": "" },
  "itemType": { "LA": "leather-armor", "MA": "chain-mail", "HA": "plate-armor", "S": "shield", "M": "broadsword",
                "R": "bow-arrow", "A": "arrow-flights", "P": "potion-ball", "SC": "scroll-unfurled", "W": "gem-pendant",
                "ST": "wizard-staff", "RD": "rod-of-asclepius", "WD": "fairy-wand", "RG": "ring", "G": "backpack", "$": "coins" },
  "spellSchool": { "A": "shield", "C": "portal", "D": "crystal-ball", "EN": "brain", "EV": "explosion", "I": "mirror-mirror",
                   "N": "death-skull", "T": "transform" } }
```
Icon names must exist in the fetched set; the build fails on a missing name. Matching order for creatures: custom art → `ancestry` → name keywords (after removing synonyms' blanked words) → synonyms → `creatureType`. Unmatched names are logged to `Library/logs/icon-misses.txt` so the tables can grow. Measured baseline on the community file: name/ancestry matching alone covers 47% of monsters; the type fallback covers the rest.
