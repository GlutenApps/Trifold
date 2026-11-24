# Data formats and parsing rules

Every file Trifold reads or writes, and the rules its importers follow. Companion to [`DESIGN.md`](DESIGN.md). Everything here describes the code as it is, except §2.15, which is a plan.

The rules in §2 and §3 come from real files: the SRD compendium XML bundled with Fight Club 5e (v1.65) and Game Master 5e (v1.30), the apps' in-app import tutorials, a Game Master 5e campaign export, and large compendium files tested locally. A rule marked **(observed)** is read from files rather than from documentation. A detail marked **(verify)** has not been confirmed against a real file, and the parser tolerates the plausible shapes.

Test fixtures: [`fixtures/compendium-sample.xml`](../fixtures/compendium-sample.xml), `campaign-sample.xml` and `open5e-sample.json` are small, hand-written and SRD-only, and exercise every convention below. Fixtures contain only SRD content and this project's own text. Larger compendium files of your own are tested locally and stay out of the repo: name them `*.local.xml` or put them under `fixtures/local/`, both git-ignored.

---

## 1. Overview of formats

| Format                    | Root                                       | Producer                                                 | Trifold use                                          |
| ------------------------- | ------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------- |
| Compendium XML            | `<compendium version="5" auto_indent="NO">` | Lion's Den apps, other compendium builders               | Import (all kinds); export of homebrew is planned    |
| Campaign XML              | `<data version="5">` wrapping `<campaign>` | Game Master 5e export; Fight Club "GM export"            | Import PCs, NPCs, notes, items, encounters           |
| Open5e v2 JSON            | REST API                                   | Open5e                                                   | Build-time SRD snapshot                              |
| Trifold JSON / JSONL      | see §5                                     | Trifold                                                  | The Library on disk                                  |
| `.trifold-campaign` (zip) | `manifest.json` + `campaign/`              | Trifold                                                  | Campaign export and import (§5.4)                    |
| game-icons SVG            | `github.com/game-icons/icons`              | game-icons.net                                           | Build-time token glyphs (§6)                         |

Parsing is lenient everywhere. A record's unknown child elements are kept in `data.extra`, serialized back to XML and grouped by element name. A missing field produces a warning, not a failure, and a record that cannot be read is skipped with a warning. Whitespace is trimmed. Names are matched by key: `normalizeKey(name)` lowercases, strips `[…]` and `(…)` tags, folds accents, strips punctuation and collapses spaces (`packages/rules/src/normalizeKey.ts`).

---

## 2. Lion's Den compendium XML

The importer is `packages/importers/src/compendium/`; the field parsers and regexes are in `packages/rules/src/statblock/`.

### 2.1 Root and record types

`<compendium version="5" auto_indent="NO">` holds any number of `<class>`, `<spell>`, `<item>`, `<race>` (2014 races and 2024 species alike), `<feat>`, `<background>` and `<monster>`. The SRD file bundled with Fight Club also has top-level `<container>` records (equipment packs). Game Master's bundled files have no classes, races or feats.

The file is streamed record by record, so a large file never sits in memory whole. A root other than `<compendium>`, or a `version` other than `5`, is a warning and parsing goes on. A top-level element of an unknown kind is skipped with a warning. A file whose root is a campaign is refused with a pointer to the campaign importer (§3).

Several `<text>` children on one element are paragraphs, joined with a blank line (`\n\n`); empty ones are dropped. Text may contain literal newlines. A `<text>` line starting with `Source:` is a citation (§2.9).

Warnings for a missing field are grouped: one line per kind and field, naming up to five records, such as `14 monsters missing cr (…)`. A source keeps at most 1,000 warnings and summarizes the rest.

### 2.2 `<monster>`

Documented fields: `name`, `size`, `type` (free text such as `humanoid (goblinoid)`, subtype in parentheses), `alignment`, `ac`, `hp`, `speed`, `str dex con int wis cha` (integers), `save`, `skill`, `resist`, `vulnerable`, `immune`, `conditionImmune`, `senses`, `passive` (integer), `languages`, `cr`, then repeated `trait`, `action`, `reaction` and `legendary`, each with `name`, one or more `text`, optional repeatable `attack`, and optional `recharge`.

Undocumented fields **(observed)**: `init` (integer initiative bonus, almost always on 2024 entries), `description` (lore paragraphs ending in a `Source:` line), `environment` (comma list, may be empty, such as `underdark, urban`), `spells` (comma list of spell names), `slots` (comma list, §2.6), `sortname` (such as `Dragon, Ghost`), `ancestry` (a grouping label such as `Dragon`, `Golem`, `Dinosaur`), `npc` (`YES` on named NPCs from adventures) and `legendary category="lair"` (lair actions).

Field formats:

- `size`: a letter `T|S|M|L|H|G` or the word (`Tiny` … `Gargantuan`). Missing or unknown warns and leaves the size empty.
- `ac`: `17`, `15 (natural armor)` or `16 (chain mail, shield)` → `{ value, note? }`.
- `hp`: `150 (20d10+40)` → `{ average, formula? }`. Some records have only the number.
- `speed`: comma list; each entry is `walk 30 ft.`, `fly 60 ft. (hover)` or a bare `30 ft.` (walk). Modes are walk, fly, swim, climb and burrow; `(hover)` sets `hover`. Other notes in parentheses, such as `(requires level 4+ spell)`, are kept in `notes`, and the original string is kept as `raw`.
- `save`: `Wis +6, Con +6, Dex +3` (ability abbreviation and signed integer). May be empty.
- `skill`: `Perception +10, Stealth +6`. May be empty.
- `str` … `cha`: a missing score warns and defaults to 10.
- `senses`: free text (`darkvision 60 ft., blindsight 30 ft.`); capitalization varies.
- `cr`: `0`, `1/8`, `1/4`, `1/2`, `1`–`30`, as strings. An unknown or missing CR warns; XP comes from the CR.
- `resist`, `vulnerable`, `immune`, `conditionImmune`: split on `;` and then `,`. A segment containing `from`, `that`, `while`, `except`, `during` or `unless` stays whole, so `bludgeoning, piercing, and slashing from nonmagical attacks` is one entry.
- `type`: split at the first `(`; before it is the type (lowercased), inside it the subtype.
- `environment`: comma list, lowercased.

**Proficiency bonus (observed, 2024 entries):** a `<trait>` named `Proficiency Bonus` whose whole text is a signed number (`+4`). It is removed from the trait list and stored as `proficiencyBonus`. A trait of that name with other text, such as a companion's "equals your proficiency bonus", stays an ordinary trait. Without one, the bonus comes from the CR (`DESIGN.md` §7.5).

**Treasure (observed, 2024 entries):** a `<trait>` named `Treasure` holds the treasure-theme text. It stays a trait and the stat block shows it under a "DM info" heading.

### 2.3 Features: uses, recharge, bonus actions, legendary and lair

`<recharge>` codes **(observed)**:

| Value                          | Meaning                                    | Tracker behaviour                                        |
| ------------------------------ | ------------------------------------------ | -------------------------------------------------------- |
| `D4`, `D5`, `D6`               | Recharge on a d6 roll of N–6               | Roll d6 at the start of the creature's turn; ready if ≥ N |
| `1/DAY`, `2/DAY`, `3/DAY`      | Uses per day                               | Counter, resets on a long rest                           |
| `SHORT` (or `1/SHORT`)         | Recharges after a short or long rest       | Counter of 1, resets on any rest                         |
| `LONG`, `REST` (or `N/LONG`, `N/REST`) | Recharges after a long rest, or any rest | Counter, resets accordingly                       |
| `3/TURN` (on the legendary header) | Legendary actions per round            | Pool size, resets at the start of the creature's turn    |

Any other code warns and is ignored.

Uses also appear in names: `Dominate Mind (2/Day)`, `Frightful Presence (Recharge 5–6)`, `Legendary Resistance (3/Day)`. They are parsed and stripped for display (`displayName`), and create counters whether or not `<recharge>` is present; a `<recharge>` code wins over the name. The patterns (`packages/rules/src/statblock/featureName.ts`):

```
uses:      /\((\d+)\/(Day|Turn|Short Rest|Long Rest|Rest)\)/i
recharge:  /\(Recharge\s*(\d)(?:\s*[–-]\s*(\d))?\)/i        → min = $1
bonus:     /\(Bonus Action\)\s*$/i                           → tag "bonus-action", move to bonusActions
variant:   /^Variant:\s*/i                                    → tag "variant"
cost:      /\(Costs (\d) Actions?\)/i                         → cost
```

**Bonus actions (observed):** there is no `<bonus>` element. A bonus action is an `<action>` whose name ends with `(Bonus Action)`. Names may carry several parentheticals, such as `Fey Step (Fey Only; Recharges after a Long Rest) (Bonus Action)`.

**Legendary actions (observed):** the first `<legendary>` element is usually a header named like `Legendary Actions (3/Turn)`, with `<recharge>3/TURN</recharge>` and explanatory text. It is taken as the header when its name starts with "Legendary Action" or it has a per-turn use; its count becomes the pool and its text the header. The following `<legendary>` elements are the options; some cost 2 actions, stated in the text or as `(Costs 2 Actions)` in the name. A block with options but no header gets a pool of 3. Every `<legendary category="lair">` element, often starting with a header-like entry named `<Creature> Lairs`, goes to `lair` instead (lair actions and regional effects).

**Multiattack:** an `<action>` named `Multiattack`. The tracker's Multiattack button finds the creature's other action names in its text (whole words, plural allowed) and rolls them in the order they appear.

### 2.4 `<attack>` triples

`label|toHit|damage`, such as `Bludgeoning Damage|+9|2d6+5`. **(observed)** `toHit` may be blank for save-based or automatic effects (`Psychic Damage||3d6`), and `damage` may be blank for a to-hit alone (`Spellcasting|+9|`). `damage` may be a compound expression `(1d8+2)+(1d6)` or a plain die. Triples also carry non-attacks: `Heal||1d10`, `Days||5d10`.

A triple is an attack when it has a to-hit or the feature's text matches an attack pattern (§2.5); otherwise it becomes a roll button named by its label. A triple with neither a to-hit nor readable dice, or with damage that is not a dice expression, warns and is dropped. An attack takes its damage type from a label of the form `<Type> Damage`, otherwise from the matching text attack, along with reach or range and any extra damage. In 2014 entries the label is usually the action name; in 2024 entries it is usually the damage type. A feature with no triples gets its attacks from the text alone.

Dice expressions accepted everywhere: `NdM`, integers, `+`, `-`, parentheses and whitespace, plus `kh`/`kl` keep-highest or keep-lowest (`4d6kh3`) and an integer multiplier (`2d4x10`) (`packages/rules/src/dice.ts`).

### 2.5 Text patterns for attacks and saves

2024 stat blocks are formulaic; 2014 blocks use the older phrasing. Both parse (`packages/rules/src/statblock/attacks.ts`):

```
2024 attack, read in three steps:
header  /(Melee or Ranged|Melee|Ranged) Attack Roll:\s*([+-]\d+)(?:\s*to hit)?(?:\s*\([^)]*\))?,\s*/gi
reach   /^(reach|range)\s+(.{1,60}?)\.(?=\s+(?!or\b)|$)/i
damage  /^\s*(?:Hit:\s*)?(\d+)\s*(?:\(([^)]+)\))?\s*([A-Za-z]+) damage/i
  → { kind, toHit, reach | range, average?, damage? (formula, or the average when there is none), damageType? }

2014 attack:
/(Melee|Ranged|Melee or Ranged) (Weapon|Spell) Attack:\s*([+-]\d+) to hit,\s*(reach|range)\s*([^,]+),\s*([^.]+)\.\s*Hit:\s*(\d+)\s*(?:\(([^)]+)\))?\s*([A-Za-z]+) damage/gi

2024 save:
/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:\s*DC\s*(\d+)/gi

2014 save:
/DC\s*(\d+)\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/gi
```

SRD 5.2 writes the 2024 attack several ways, and all of them parse: without `Hit:` (`reach 5 ft. 1 Piercing damage`), with a note after the bonus (`+5 (with Advantage if the target is Grappled)`), as `+4 to hit`, with `feet` for `ft.`, and as `reach 10 ft. or range 20/60 ft.` (kept whole as the reach). An attack whose damage can't be read, such as one that only grapples, is still an attack: it keeps its to-hit and gets a button that rolls the d20 alone.

A save is `halfOnSuccess` when the 400 characters after it contain `Success: Half damage`, `half as much damage on a success` or `half as much damage if it succeeds`.

Secondary damage in the same sentence as an attack (`plus 7 (2d6) Fire damage`) matches `/plus\s*(\d+)\s*\(([^)]+)\)\s*([A-Za-z]+) damage/gi` and is added as extra damage parts.

### 2.6 Spellcasting on monsters

`<spells>` is a comma list of spell names (case varies; matched by key). `<slots>` is a comma list starting with cantrips, then slots per spell level: `0,4,3` means cantrips unlisted or at will, four 1st-level and three 2nd-level slots **(observed; matches the class `slots` convention)**. A `slots` value that is not a list of non-negative integers warns. 2024 blocks describe at-will and per-day spells inside a `Spellcasting` trait or action; the text is kept, and `<spells>` drives the lookup links. Innate spellcasting in 2014 blocks is a trait named `Innate Spellcasting`.

### 2.7 `<spell>`

Fields: `name`, `level` (0–9; missing or out of range warns and becomes 0), `school` code (`A` abjuration, `C` conjuration, `D` divination, `EN` enchantment, `EV` evocation, `I` illusion, `N` necromancy, `T` transmutation; may be blank), `ritual` (`YES`), `time`, `range`, `components` (such as `V, S, M (a pinch of salt)`), `duration`, `classes` (comma list; 2024 entries use names like `Wizard [5.5e]`, and some files use the field for lists that are not classes, such as `Maneuver Options [5.5e]`), `text` (repeatable), `roll` (repeatable, with `description` and `level` attributes for scaling), and the rare `modifier` and `special`.

### 2.8 `<item>`

Fields: `name`, `type` code, `magic` (`YES`/`NO`), `detail` (rarity and attunement, such as `rare (requires attunement)`), `weight`, `value` (gold), `ac`, `strength` (minimum Strength for heavy armor), `stealth` (`YES` = disadvantage), `dmg1`, `dmg2` (versatile), `dmgType` code, `property` codes (comma list), `range` (`80/320`), `text`, `roll` and `modifier`.

Type codes: `LA` light armor, `MA` medium armor, `HA` heavy armor, `S` shield, `M` melee weapon, `R` ranged weapon, `A` ammunition, `P` potion, `SC` scroll, `W` wondrous item, `ST` staff, `RD` rod, `WD` wand, `RG` ring, `G` adventuring gear, `$` money or treasure. A missing type code warns.

Damage type codes: `B` bludgeoning, `P` piercing, `S` slashing, `A` acid, `C` cold, `F` fire, `FC` force, `L` lightning, `N` necrotic, `PS` poison, `PY` psychic, `R` radiant, `T` thunder.

Property codes: `A` ammunition, `F` finesse, `H` heavy, `L` light, `LD` loading, `M` martial, `R` reach, `S` special, `T` thrown, `2H` two-handed, `V` versatile.

Rarity and attunement come from `detail` with `/(very rare|uncommon|common|rare|legendary|artifact)/i` and `/requires attunement/i`; the item page shows them beside the type. `detail` itself is kept as written. Some files repeat the rarity in `text` as well, and the text is shown as it is.

Equipment packs: a top-level `<container>` with nested `<item>` entries, each with a `<quantity>` (SRD file only), becomes an adventuring-gear item with a `contents` list. Without its own text, its text lists the contents.

### 2.9 Source citations and `description`

A monster's `description`, and the `text` of other kinds, usually ends with `Source: <Book Name> p. <N>` or `Source: <Book Name>, p. <N>` **(observed)**. Also observed: a tag in brackets after the page that belongs to the book (`Source: <Book Name> p. <N> (Third Party)`), and a line naming several books, each but the last ending in a comma. The line is found with

```
/^\s*Source:\s*(.+?)\s*$/im
```

and, after a trailing comma or semicolon is dropped, its first citation is read with

```
/^(.+?)(?:,\s*|\s+)p(?:g|age)?\.?\s*(\d+)[\w-]*\s*(\([^)]*\))?/i
```

The book is the first group with the bracketed tag after it, so every page of a book is one book; the page is the second group. A line with no page is all book. Only the first book of several is kept. The line is removed from the displayed text. (Importer version 5; files read by earlier versions kept the page in the book's name when anything followed it.) Monsters take the citation from `description`; spells, items and feats from their `text`; species and backgrounds from their traits' text. Classes carry no citation. Book names are data from the imported file and are never bundled.

### 2.10 Edition tagging

- A trailing `[5.5e]` on `name` marks a 2024 record. It is stripped from `displayName`, and `edition` is `2024`.
- `(Legacy)`, `(UA)` and `(TP)` in a name are stripped into `tags`: `legacy`, `unearthed-arcana`, `third-party`.
- A record whose source book is in the source's 2024 list (`edition2024Books` in `source.json`) is `2024` even without the suffix. An entry with brackets names one book exactly, as the Books tab writes it, so marking one printing (`… (2025)`) leaves another (`… (2014)`) alone; an entry without brackets, as a DM may type it in Settings, matches any printing of that title except one whose bracketed year is before 2024 (`isMarked2024`, ADR 0065). The list is chosen per imported file on Library › Compendium › Sources; a newly imported file starts from the Library-wide list in `library.json`. Typical entries are `Monster Manual (2025)`, `Player's Handbook (2024)` and `Dungeon Master's Guide (2024)`. `init` is not an edition signal: some 2024 monsters lack it and some older ones have it.
- Otherwise the record takes the source's `defaultEdition` (`2014` for imported files). The edition values are `2024`, `2014` and `unknown`.
- The same creature often exists twice (`Aboleth` and `Aboleth [5.5e]`). Both have `key = "aboleth"`, and the compendium shows them as one entry with an edition switch.

### 2.11 `<race>` (species)

Fields: `name`, `size`, `speed` (integer or text), `ability` (such as `Cha +2, Int +1`; empty for 2024 species), `proficiency`, `spellAbility`, `spells`, `languages`, `weapons`, `tools`, `armor`, `resist`, `vulnerable`, `conditionResist`, `conditionImmune`, `speedOther`, `ancestry` (groups subraces under a parent) and repeated `trait` (`name`, `text`, `roll`, `modifier`) with `category="species"|"subspecies"|"description"` **(observed)**. A `displayname` element, when present, is kept in `data.extra`. Trifold only browses species (there is no character builder), so they are stored as name, text and these fields as strings.

### 2.12 `<class>`

Fields: `name`, `hd`, `proficiency` (comma list of saves and skill options), `numSkills`, `armor`, `weapons`, `tools`, `wealth`, `spellAbility`, `slotsReset` (`L` long, `S` short), and repeated `autolevel level="N"` (1–20, optional `scoreImprovement="YES"`) containing:

- `feature` (optional `optional="YES"`) with `name`, `text`, `special`, `modifier`, `roll`;
- `slots` (optional `optional="YES"`), the same list as §2.6;
- `counter` with `name`, `value`, `reset` (`L`/`S`) and **(observed)** `subclass`, naming the subclass the counter belongs to.

An `autolevel` with a level outside 1–20 warns and is skipped. Subclass features are optional features named `<Subclass>: <Feature>`, and choice groups (`Fighting Style: …`, `Metamagic: …`) use the same prefix. Classes are for browsing: the class page lists each level's features in file order, with optional ones badged.

### 2.13 `<feat>` and `<background>`

Feat: `name`, `prerequisite`, `text`, `modifier`, `proficiency`, `special`, `roll`. Background: `name`, `proficiency`, `trait` (repeatable `name`, `text`, `roll`, `modifier`, optional `category`), `modifier`, and **(observed)** `ancestry` (grouping).

### 2.14 `<modifier>` and `<roll>`

`<modifier category="bonus|ability score|ability modifier|saving throw|skill">value</modifier>`, such as `ac +2`, `speed +10`, `melee attacks +1`, `ranged damage +3`, `saving throws +1`, `strength +2`. Stored as `{ category, target, value, raw }` by splitting off the trailing signed integer; category and target are lowercased. A modifier without a number warns and is dropped.

`<roll description="Fire Damage" level="8">8d8</roll>`: `level` scales the roll by character or spell level. Stored as `{ dice, description?, level? }` with whitespace removed from the dice; an empty roll is dropped.

### 2.15 Export **(not built)**

Planned: Trifold writes the same schema, `<compendium version="5" auto_indent="NO">`, one element per record, fields in the documented order, `text` paragraphs as separate `<text>` elements, and `Source: Trifold Homebrew` appended to homebrew descriptions. Names are unique per kind. Exporting a record whose `basedOn` points at a `nonSrd` source shows a warning first (`DESIGN.md` §8).

---

## 3. Lion's Den campaign XML

The importer is `packages/importers/src/campaign/`. A campaign file imports into a new campaign or merges into an open one, from Library › Campaigns.

### 3.1 Structure

A Game Master 5e (v1.30) export is `<data version="5">` wrapping one `<campaign>`, whose children are `<imageData>`, `<name>`, `<pc>`, `<npc>`, `<encounter>`, `<item>` and `<note>`, in that order. A bare `<campaign>` root is accepted too, as is an `<adventure>` element holding its own `<note>`, `<encounter>`, `<pc>`, `<npc>` and `<item>` children. Any other element warns and is ignored.

- `<note>`: `<name>`, `<text>`, `<expanded>0|1</expanded>`. An empty note (only `<expanded>`) is skipped.
- `<item>`: `<name>`, `<text>` (rarity and attunement as text lines), numeric `<type>`, `<weight>`, `<magic>1</magic>`, `<roll>`. All items from one file become a single note, "Items from import", listing them.
- `<encounter>`: `<name>`, `<state>`, `<current>`, `<round>`, then `<combatant>` entries and optional `<note>` children, which are added to the encounter's notes. Each `<combatant>` wraps one `<monster>` that is either a reference to a PC or NPC (`<monster><uid>818</uid></monster>`), or a full inline stat block (§3.2) with `<enemy>1</enemy>` and a table `<label>` such as `Wolf 1`. Identical inline blocks repeat per combatant; Trifold keeps one record per kind and key.

### 3.2 `<pc>` / `<npc>` / inline `<monster>` (Game Master native shape)

This is not the compendium shape. A node is read as Game Master native when it has `<abilities>`, `<hpMax>` or `<savingThrow>`; otherwise it is read as a compendium `<monster>`.

Fields **(observed)**:

- `<uid>`; `<label>`, the character's or NPC's display name; `<name>`, for PCs the race, class and level (`Dwarf, Hill Cleric 5`), for NPCs the monster name; `<enemy>1</enemy>` on hostile NPCs.
- `<type>`, `<alignment>`; `<size>` numeric 0–5 = T S M L H G (absent = M).
- `<ac>` with `<armor>` as its note; absent at the default of 10.
- `<abilities>14,8,15,12,18,10</abilities>` (Str Dex Con Int Wis Cha); `<hpMax>`, `<hpCurrent>`, `<hd>`; `<speed>`; `<init>`.
- `<savingThrow><ability>N</ability><modifier>M</modifier></savingThrow>` (ability 0–5 = Str … Cha, absent = 0).
- `<skill><id>N</id><modifier>M</modifier></skill>`, numbered 0–17 alphabetically: 0 Acrobatics, 1 Animal Handling, 2 Arcana, 3 Athletics, 4 Deception, 5 History, 6 Insight, 7 Intimidation, 8 Investigation, 9 Medicine, 10 Nature, 11 Perception, 12 Performance, 13 Persuasion, 14 Religion, 15 Sleight of Hand, 16 Stealth, 17 Survival.
- `<passive>`, `<languages>`, `<resist>`, `<vulnerable>`, `<immune>`, `<conditionImmune>`, `<senses>`, `<description>`.
- `<cr>` numeric: `-1` = 1/4, `0` = 1/2, `n` = n, absent = 1. `-2` (seen on a sheep) is read as 1/8 and anything lower as 0 **(verify)**.
- `<environment>` bitmask, ignored.
- `<trait>` and `<action>` as in §2.2, except that a trait named `Source` holds the citation (`Monster Manual, p. 341`; its first line is used), and `<attack>` is structured: `<attack><name>Bite</name><atk>6</atk><dmg>2d10+4</dmg></attack>`, with `<atk>` absent for save effects. A plain-text triple is accepted too.
- Spellcasters embed `<spell>` records (numeric `<school>` 1–8 in alphabetical order, `<v>1</v><s>1</s><m>1</m><materials>`, repeated `<sclass>`, `<roll>`), plus `<slots>4,3,3,1,0,0,0,0,0,0,</slots>` (trailing comma dropped) and `<slotsCurrent>`.

Trifold rewrites these nodes into the compendium shape (`gmNative.ts`) and runs the ordinary monster and spell normalizers. PCs become PC cards: the name from `<label>`, class and level split from `<name>`, merged by name in merge mode. NPCs keep a link to their stat block. Stat blocks and spells from the file go into a source named `<campaign> (campaign file)`, shown only in that campaign (`campaignIds`, §5.1).

### 3.3 Fight Club "GM export"

Fight Club writes a file named `<Character Name> GM.xml`: a campaign XML containing one `<pc>` stat block **(verify; read from the app, not yet from a player's real export)**. It is lossy by design, with no equipment and no prepared-spell state. Import it with the same campaign importer in merge mode, and the PC merges into the campaign by name. A synthetic fixture covers this path.

### 3.4 Backups

Fight Club and Game Master write `FightClub5.backup` and `GameMaster5.backup` files that appear to contain `saveData.xml` and `saveCompendium.xml` **(verify)**. Trifold does not import them.

---

## 4. Open5e (build-time SRD snapshot)

- **Fetch:** `scripts/fetch-open5e.ts` reads the Open5e v2 API (`--api <base url>` points it at another copy). It pages each kind (creatures, spells, items, species, classes, feats, backgrounds) with `?document__key=<key>&limit=200` for the documents `srd-2024` and `srd-2014`. Conditions are the exception: each is one shared record with a description per document, so the script reads `conditions/` once and writes a `condition` record for every document that has text for it. It writes `resources/srd-2024.jsonl` and `srd-2014.jsonl` (git-ignored) and records document keys, counts, licence texts, the fetch date and file hashes in `resources/srd-manifest.json` (committed). `scripts/check-content.mjs` refuses to build when the files are missing or do not match the manifest.
- **Rules:** `rulesets/` lists each document's rules chapters as sections with their rules nested (`key`, `name`, `desc` in markdown, `index`). Each rule becomes a `rule` record `{ text, section, order }`; a section with text but no rules becomes one record itself. A name repeated within a section is taken from the rule's key (with a manifest warning). A name shared across sections gets its section in front, such as `D20 Tests: Ability Checks` (see ADR 0041).
- **Licences:** SRD 5.1 and 5.2.1 are CC-BY 4.0. Third-party documents carry their own licence and attribution fields, which the script copies into the manifest for the About page.
- **Normalization:** `packages/importers/src/open5e/` maps Open5e fields onto the same `Record.data` shapes the XML importer produces (`DESIGN.md` §5.1). Open5e records are structured and need no text-pattern parsing for their fields, but the attack and save patterns of §2.5 still run over action text to fill attacks and save calls for the tracker. A class's **Core Traits** table (Open5e's `CORE_TRAITS_TABLE` feature) fills the fields a Lion's Den class has (§2.12): `proficiency` is the saving throws then the skill options, `numSkills` how many to choose ("Choose any 3 skills" leaves the options empty and sets `extra.anySkills`), `armor`, `weapons` and `tools`; its starting equipment goes to `extra.equipment` as one entry per option (`A: …`, `B: …`) and its primary ability to `extra.primaryAbility`. The class table's own columns (`CLASS_TABLE_DATA`: Cantrips, Prepared Spells, Rages and the like) go to `extra["table:<column>"]`, twenty values, one per level, a level the source leaves out taking the value before it. Skill names are matched with spaces ignored, since the source has stray ones ("In sight"). The character builder reads these (docs/BUILDER.md).
- **SRD 5.1 classes and races** (the 2014 builder, docs/BUILDER.md) have no core traits table, so other features fill the same fields:
  - **`PROFICIENCIES`**, "**Armor:** …" lines, gives armour, weapons and tools, and the skill choice in words ("Choose two skills from …", "Choose any three").
  - **`STARTING_EQUIPMENT`**'s bullet lines become `extra.equipmentChoices`, one line each as written without markdown ("(a) chain mail or (b) leather armor, longbow, and 20 arrows", "A spellbook").
  - **Caster type:** Open5e leaves it blank for these classes, so `casterType` comes from the slot columns: nine `SPELL_SLOTS` columns for a full caster, fewer for a half caster, and a "Spell Slots" table column for Pact Magic.
  - **Subraces:** a subspecies names its parent by key (`subspecies_of: "srd_elf"`), kept as `extra.subspeciesOf: ["elf"]`, the parent record's key.
- The fetch runs only at build time. The app itself never contacts Open5e.

---

## 5. Trifold internal formats

The Library is a folder of plain files; SQLite is only a derived index. Every JSON file is UTF-8 with 2-space indent and carries a `schemaVersion` integer; ids are ULIDs and timestamps are ISO 8601 UTC strings. Every write goes through `LibraryStore` in the main process and is atomic: temp file, fsync, rename. The Zod schemas in `packages/schema/src` are the single definition of every file; this section is a summary. Files written by an older version are brought forward on read by the migrations in `packages/schema/migrations`.

```
Library/
  library.json                 Library settings (schema 5)
  index.sqlite                 derived search index (§5.6)
  sources/<id>/                imported compendium files (§5.1, §5.2)
  homebrew/<id>.json           the DM's own records (§5.3)
  art/<kind>/<key>.png         creature art (§5.4)
  templates/notes/<id>.json    note templates (§5.4)
  campaigns/<slug>/            one folder per campaign (§5.4)
  characters/<id>.json         the player's characters (§5.7)
  music/library.json           music library (§5.5)
  music/playlists/<id>.json    playlists (§5.5)
  backups/                     daily backup zips
  logs/                        main-process logs and icon-misses.txt
```

Schema versions: `library.json` is at 5 and PC cards (`campaigns/<slug>/pcs/<id>.json`) at 2, since `dndBeyondUrl` became `sheetUrl` (ADR 0070); every other Library file is at 1. Settings that belong to the computer rather than to a Library (which Library is open, window positions, the audio source, the update check, the table server's port) are in `config.json` in the app's user-data folder.

Backups are zips named by date (`2026-11-16.zip`, with `-quit` or `-pre-restore` variants) holding the whole Library except `backups/`, `logs/` and `index.sqlite`.

### 5.1 `sources/<id>/source.json`

```json
{
  "schemaVersion": 1,
  "id": "01J…",
  "name": "My compendium",
  "kind": "xml",
  "filePath": "original.xml",
  "fileHash": "sha256:…",
  "enabled": true,
  "campaignIds": null,
  "defaultEdition": "2014",
  "edition2024Books": ["Monster Manual (2025)", "Player's Handbook (2024)"],
  "deletedBooks": ["example book third party"],
  "license": { "nonSrd": true, "attribution": null },
  "importedAt": "2026-09-27T18:42:00Z",
  "importerVersion": 3,
  "recordCounts": { "monster": 412, "spell": 120, "item": 300 },
  "warnings": ["14 monsters missing cr (…)", "…"]
}
```

Sources in the Library have `kind: "xml"`: an imported compendium file, whose original is copied in as `original.xml`, or the stat blocks from a campaign file (§3.2), which have no original. The bundled SRD sources (`srd-2024`, `srd-2014`) ship with the app rather than living in the Library, and homebrew and campaign creatures are virtual sources (§5.3). `campaignIds` is null or absent when the source shows in every campaign, or the ids of the only campaigns that show it; a campaign file's stat blocks start with just their own campaign. `license` may also carry an `spdx` id; `nonSrd` marks a source that may hold content outside the SRD. `importerVersion` is the importer that wrote `records.jsonl`; a compendium file parsed by an older importer is re-parsed from `original.xml`. `deletedBooks` (optional) lists the books the DM deleted from the file (ADR 0065), by book key, or `file:<id>` for its records that name no book: they are gone from `records.jsonl`, and Re-parse leaves them out; importing the file again clears the list.

### 5.2 `sources/<id>/records.jsonl`

One record per line, in file order (`DESIGN.md` §5.1): `schemaVersion`, `id`, `kind` (`monster`, `spell`, `item`, `feat`, `species`, `background`, `class`, `condition`, `rule`), `key`, `name`, `displayName`, `sourceId`, optional `sourceBook` and `sourcePage`, `edition`, `tags`, optional `basedOn`, and the kind's `data`. Rewritten in full on re-import; re-importing a changed file keeps record ids stable by key.

### 5.3 `homebrew/<id>.json`

One record per file, with `sourceId = "homebrew"` and `sourceBook = "Trifold Homebrew"`. Ids are `homebrew:<kind>:<ulid>`; the file name is the id with each `:` replaced by `_`. A record copied from another carries `basedOn: { recordId, sourceId }`. A monster changed with the CR scaler carries `data.scaled: { "fromCr": "1/4", "toCr": "3" }`: the CR it was first written at and the CR it is now.

A campaign's own creatures use the same shape in `campaigns/<slug>/creatures/<id>.json`: `sourceId = "campaign:<slug>"` (a file copied in from another campaign takes its folder's source id when read), ids `creature:<kind>:<ulid>`, and `basedOn` when made from another record. The folder is one virtual source of kind `campaign` to the index, shown as "This campaign" only while that campaign is open and never grouped by key with Library records.

Both folders are virtual sources: the index treats each as one source whose hash follows its files' names and modification times.

### 5.4 Campaign folder

`campaigns/<slug>/` holds:

| Path                                  | Contents                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `campaign.json`                       | The campaign: name, slug, preferred edition, active adventure, and `settings` (player-window overlays, token style, HP display, initiative mode, the summon list) |
| `pcs/<id>.json`                       | PC cards; `currentHp` and `tempHp` carry over between fights, absent means full                |
| `npcs/<id>.json`                      | NPCs: optional stat block (`recordRef`), portrait, role, location, notes, alive or dead, HP from their last fight, and `companionOf` (the PC id an NPC companion belongs to) |
| `encounters/<id>.json`                | Encounters: combatant templates, the live fight in `state` (autosaved, null between fights) and `results` with each finished fight's log |
| `adventures/<id>.json`                | Adventures                                                                                     |
| `notes/<id>.json`                     | Notes and note folders (`kind: "note" \| "folder"`, `parentId`, `order`); body in markdown     |
| `scenes/<id>.json`                    | Scenes: folder, title, image, map or blank grid, with tokens, grid, entry markers, fog and the player camera |
| `counters/<id>.json`                  | The Counters tool's counters                                                                    |
| `timers/<id>.json`                    | The Timers tool's timers; definitions only, every timer is idle after a restart                |
| `pinnedRolls/<id>.json`               | Rolls pinned from the roll log                                                                  |
| `sessions/<id>.json`                  | The session log (below)                                                                         |
| `creatures/<id>.json`                 | The campaign's own creatures (§5.3)                                                             |
| `images/<id>.<ext>`                   | Scene art as imported (PNG, JPG or WebP), with `images/<id>.display.jpg` beside it: a JPEG copy for the player window, long edge at most 4096 px |
| `tokens/<id>.png`                     | Art for one token, and PC and NPC portraits, fitted inside 512 × 512                            |
| `players.json`                        | The table server's devices and claims (below)                                                   |

A folder appears when its first file is written, so a campaign may lack any of them. Each entity file is one object; the Zod schemas in `packages/schema/src/campaign.ts` give every field.

**Session log:** a session is `{ title, recap (markdown), events[], startedAt, lastActivityAt }`. Each event has its time `at` and is a `fight` (`encounterId`, `name`, `xp`, `rounds`, `casualties[]`, `pcs`), a `scene` (`sceneId`, `title`) or a `death` (`npcId`, `name`).

**Table server (`players.json`):** written only by the main process, so the console's saves of PC cards and NPCs never erase a claim. It holds `devices[]` (`deviceId`, `tokenHash` as SHA-256 hex, `label`, `lastSeen`; the device token itself never touches disk), `claims[]` (`creatureKind` `pc` or `npc`, `creatureId`, `deviceId`, `claimedAt`, and `pinHash` as scrypt `salt:hash` in PIN mode), `reclaimMode` (`open`, `pin` or `approval`), `movement` locks (`all`, and `creatures` as `kind:id`) and `summoning` (`mode` `on`, `approval` or `off`, and a `cap` per character). PC cards and NPCs carry `playerControllable` (absent means offered to players). A creature a player summons is a token with a `summon` block: its owner, HP, AC, initiative, expiry round, concentration, and whether it persists after the fight. See [`PLAYER-CONNECTOR.md`](PLAYER-CONNECTOR.md).

**Scene coordinates:** token positions are in grid units (floats) relative to the grid origin (`grid.offsetX`/`offsetY`, in image pixels). Pixel position = `offset + coord × cellPx`. `footprint` is in cells (1–4).

**Fog of war:** a map or blank-grid scene may carry `fog: { enabled, shapes[] }`; absent means no fog. Shapes are in map pixels (not grid units) and apply in order over a fog that starts whole. Each is `{ id, mode: "reveal" | "hide", kind }` with `kind: "rect"` and `x, y, w, h`; `kind: "poly"` and `points` as a flat `[x0, y0, x1, y1, …]` (at least three corners); or `kind: "all"` for the whole map. A point is visible when the last shape covering it reveals it. Reveal all and Hide all drop the shapes before them. `enabled: false` keeps the shapes and shows the whole map. A token is under fog when its centre is.

**Note templates** are Library-level: `templates/notes/<id>.json` holds `{ schemaVersion: 1, id, name, body (markdown), createdAt, updatedAt }`. When the folder is missing it is created with one "Session prep" template; once it exists, deleting every template leaves it empty.

**Creature art** is Library-level too: `art/<kind>/<key>.png`, one PNG per compendium creature by its key, so every source and edition of a creature shares it, fitted inside 512 × 512. A token shows its own `art` first, then a PC's or NPC's `portrait` (for an NPC without one, its stat block's art), then its creature's art, then a generated glyph (§6).

**Campaign exports** (`.trifold-campaign`) are zips: `manifest.json` (`kind: "campaign"`, app version, Library and campaign schema versions, counts and the export options), the campaign folder under `campaign/` (entity files, `images/`, `tokens/`, `creatures/`), the homebrew records it uses under `homebrew/`, and optionally `layout.json` (the campaign's console layout). Records from imported sources are never included; the campaign refers to them by key. A file made by a newer Trifold is refused.

### 5.5 Music

`music/library.json` is `{ folders: [path], tracks: Track[], lastScanAt }`; `music/playlists/<id>.json` is a playlist (`name`, `trackIds`, `shuffle`, `loop`, optional `crossfadeSec`). Paths are absolute, and audio files are referenced in place, never copied. A track stores its title, artist, album, `durationSec`, `sizeBytes`, `gainDb` (to the −16 LUFS target, null until measured), `tags`, an optional `loop` and its `kind`.

A rescan relinks a renamed or moved file to its track (same `sizeBytes` and length; tracks without a stored size match on length within the same folder; ambiguous matches are left alone), so tags, gain and playlist membership follow the file. A track whose file is gone from a readable folder is removed, along with its playlist entries. When a folder cannot be read at all (an unplugged drive), its tracks stay listed as unavailable.

Kind (`music`, `ambience`, `sfx`) is edited as a tag: the first kind word among the tags (`ambience`/`ambiance`/`ambient`, `effect`/`effects`/`sfx`, `music`) sets `kind`, and a track with none is music.

### 5.6 Index (`index.sqlite`)

Derived, and rebuildable from the files at any time. Tables: `sources(id, name, kind, enabled, file_hash, record_count, campaigns, priority)`, `records(id, kind, key, name, display_name, source_id, edition, cr, cr_num, type, size, environment, is_npc, level, type_code, rarity, book_key, book, starred, book_off, chosen, json)`, `records_fts(id UNINDEXED, name, text)` (FTS5) and `meta` (see `apps/desktop/src/main/index/IndexDb.ts` for the exact DDL). `campaigns` is `Source.campaignIds` as a JSON array, NULL for every campaign; `priority` follows the default source order (ADR 0027). `book_key` and `book` are the record's book (ADR 0061): `bookKey` of its `sourceBook`, and the name, both empty when it names none. `starred` and `book_off` copy `library.json`'s `books`, and `chosen` its `duplicateChoices` (ADR 0063); all three are set after every sync, import and re-parse. A book that is off is left out of every query. Which copy of a record answers: the chosen copy, homebrew, a starred book, imported files, the 2024 SRD, the legacy SRD.

On each sync, a source is re-read when its `fileHash`, enabled flag or name differs from its index row, and rows for sources that no longer exist are dropped. Homebrew and campaign creatures are virtual sources whose hash follows their files. When the index layout version stored in `meta` differs from the app's, the tables are dropped and rebuilt; `library.json` records the same version in `indexVersion`. Campaign entities other than creatures are not indexed; they load from their JSON files.

### 5.7 `characters/<id>.json`

A player's character (docs/PLAYER-MODE.md, Part 3; ADR 0068), schema `Character` in `packages/schema/src/character.ts`, file kind `character` at version 1. Characters belong to the Library; a joined campaign links one by id (`joined.json`'s `characterId`).

```json
{
  "schemaVersion": 1,
  "id": "01J…",
  "name": "Aria",
  "kind": "trifold",
  "edition": "2024",
  "sheetUrl": "https://…",
  "numbers": { "classText": "", "level": 1, "maxHp": 10, "ac": 10, "initiativeBonus": 0, "speed": 30,
               "passives": { "perception": 10, "insight": 10, "investigation": 10 }, "saves": {} },
  "sheet": {
    "species": "", "background": "", "classes": [{ "name": "Rogue", "subclass": "", "level": 3 }],
    "abilities": { "str": 10, "dex": 16, "con": 12, "int": 13, "wis": 10, "cha": 14 },
    "saves": ["dex", "int"], "skills": { "stealth": "expertise" }, "otherProficiencies": "",
    "maxHp": 21, "armor": { "kind": "light", "base": 11, "shield": false, "bonus": 0 }, "speed": 30,
    "spellcastingAbility": null, "slots": [], "attacks": [], "features": [], "spells": [], "equipment": [], "gp": 0,
    "overrides": { "ac": 15 }
  },
  "notes": "",
  "createdAt": "…",
  "updatedAt": "…"
}
```

`kind` is `external` (the sheet is kept elsewhere: `numbers` holds the table numbers as entered, and `sheet` is absent) or `trifold` (`sheet` holds the sheet, and the table numbers are worked out from it by `tableNumbers` in `packages/rules/src/character/`; `numbers` is left as it was). `overrides` holds numbers set by hand over what the sheet works out, by key (`ac`, `initiative`, `save.dex`, `skill.stealth`, …). A sheet's attacks, features, spells and items may carry `ref: { kind, key, name }`, a compendium record by kind and key with its name kept for when the record is gone. `gp` is the character's coins in gold pieces, and `slots` its spell slots by slot level, 1st first. `sheetUrl` is an `http` or `https` address only. A character made by the guided builder (docs/BUILDER.md) also has `build`: the edition, the class, background and species by `ref`, the size, the ability method, the scores before the background's increase, the increase (`{plus2, plus1}` or `{all}`), the class skills picked, the hit points gained at each later level, the subclass once picked, and each ability score improvement or feat taken (`improvements`, by level); Level up follows it. A sheet's resources (ADR 0074), all optional: `slotsUsed` (spent, by slot level like `slots`), `slotsOnShortRest` (Pact Magic), `hitDiceUsed` (spent, by die size: `{ "8": 2 }`), `inspiration`, and on a feature `uses: { max, used, reset }` with `reset` `short` or `long`. A character may have `forms`: creature stat blocks pinned for a wild shape or another transformation, each `{ kind: 'monster', key, name }`, reference only. A character exported from the Library is this same JSON; importing one whose id is taken gives it a new id.

### 5.8 Character sheet PDFs (Import from PDF)

Read, never written (ADR 0073). Main takes every page's widget annotations with pdf.js, whether or not the PDF has a form dictionary, as `{ page, name, kind, value, checked, rect }`, and `readPdfSheet` (`packages/importers/src/pdfSheet/`) turns them into a sheet, warnings and a layout, or a problem (`noFields`, `unknownLayout`, `empty`). Field names match with case and runs of spaces ignored; the first filled field of a name wins, as headers repeat on every page.

| Sheet field | Field names |
| --- | --- |
| Name, class line, species, background | `CharacterName`; `CLASS  LEVEL` or `ClassLevel`; `RACE`/`Race `/`Species`; `BACKGROUND` |
| Ability scores | `STR` and `STRmod` (… `CHA` and `CHamod`), or `StrDropdown` ("14: +2") |
| Proficiency bonus, AC, initiative, speed, max HP | `ProfBonus`; `AC`; `Init`/`Initiative`/`InitiativeBonus`; `Speed`/`Speeds` (first number); `MaxHP`/`HPMax` |
| Saves and skills | `ST Strength` …; `Acrobatics`, `Animal`, … `SleightofHand`, `Stealth`, `Survival` |
| Proficiency marks | `ConProf`, `AcrobaticsProf` … (`•`/`P` proficient, `E` expertise, `H` half), or the check box (`Check Box 11` …) left of the value on its line |
| Passives | `Passive1`/`2`/`3` (perception, insight, investigation) in the export; `Passive` (perception) otherwise |
| Spellcasting | `spellCastingAbility0` or `SpellcastingAbility 2` (first ability of "INT / CHA"); `spellSaveDC0`/`SpellSaveDC  2`; `spellAtkBonus0`/`SpellAtkBonus 2` |
| Spells and slots | `spellName0` … under `spellHeader0` … ("=== 1st LEVEL ===", with `spellSlotHeader0` "4 Slots OOOO"), prepared when `spellPrepared0` is `P`; or `Spells 1014` … under `SlotsTotal 19` … (19 is 1st level), prepared by the check box beside it |
| Attacks | `Wpn Name`, `Wpn Name 2` … with `Wpn1 AtkBonus` and `Wpn1 Damage` |
| Features | `FeaturesTraits1` … as "=== CLASS FEATURES ===" sections of "* Name • source" entries; or `Features and Traits` free text, a feature per line (or per paragraph, named by its first line, when lines are long) |
| Equipment, coins | `Eq Name0`/`Eq Qty0` …, or `Equipment` free text split on commas and lines (not inside brackets, "2 daggers" is 2); `PP`, `GP`, `EP`, `SP`, `CP` summed into `gp` |
| Other proficiencies, notes | `ProficienciesLang`; personality, ideals, bonds, flaws, backstory, allies, alignment, faith and appearance into the character's notes |

**The official 2024 sheet** is told by `Text1`, `Text106.0` and `Check Box252.0` together, and its generic names are translated first (`packages/importers/src/pdfSheet/sheet2024.ts`): `Text1` name, `Text6` background, `Text7` class, `Text8` species, `Text9` subclass and `Text11` level (joined as "Cleric 5 (Life Domain)"), `Text13` AC, `Text16` max HP, `Text19` proficiency bonus, `Text26` initiative, `Text27` speed, `Text29` passive Perception; scores `Text63`–`Text68` (INT, STR, WIS, DEX, CON, CHA) and modifiers `Text20`–`Text25`; saves and skills `Text69`–`Text92` with their check boxes; six weapon rows from `Text30`; `Text54`/`Text55` class features, `Text57` species traits and `Text58` feats, a feature per line ("Name: text" when the text is long; an all-capitals line heads the lines after it); spell rows `Text105.n` (level) and `Text106.n` (name), all prepared; slot totals `Text112`–`Text120`; `Text111` spellcasting ability, `Text94` save DC, `Text95` attack; armour training boxes, `Text59` weapons, `Text60` tools and `Text98` languages into other proficiencies; `Text99` equipment with the attuned items `Text101`–`Text103`; `Text226` and `Text267`–`Text270` coins; `Text96` appearance, `Text97` backstory and `Text100` alignment into notes.

Conventions:

- **Score or modifier by value.** A plain number from 1 to 30 is the score and a signed one the modifier, whichever field holds it (the 2014 sheet prints its big box for the modifier and apps fill it both ways); two plain numbers are told apart by mod = ⌊(score − 10) / 2⌋. Minus signs may be `-`, `−` or `–`.
- **Class lines** read "Wizard 3 / Cleric 2", "Cleric 2 (Life)", "Fighter (Champion) 3" and "Rogue LVL 4"; a line that does not read is a warning.
- **Marks by position.** A check box or a mark letter counts for a save or skill when it is on the same line (centres within 4 pt) and ends at most 20 pt left of the value. A check box cannot say expertise: a skill whose number is the modifier plus twice the proficiency bonus is expertise. `H` (half proficiency) is not proficiency; its number is kept as an override.
- **Spell levels by position.** A spell takes the level of the nearest header or slot box above it that overlaps its column. In the export a level runs onto the next page; on the 2014 sheet a spell with no box above it is a cantrip. A trailing `[R]` is dropped, and a spell listed twice at one level is kept once.
- **Overrides.** Proficiency bonus, AC, initiative, passives, saves, skills, spell save DC and spell attack are kept as overrides where the page's number differs from what the sheet works out.
- **Attacks** with a save DC instead of a bonus ("DC 15 DEX") keep it after the damage: "2d8 Radiant (DC 15 DEX)".
- **Edition** is 2024 on the 2024 sheet or when any field mentions 2024; otherwise 2014. The player can change it in the preview.
- **A blank template** (no name, class or hit points, whatever its defaults) is `empty`; `--` and similar placeholders count as blank.
- **Links.** Main then sets `ref` on what the compendium has, by `normalizeKey` of the name: spells, feats (any feature), species, background and classes, where a bracket is a note ("Mage Hand (Tome)"). An item keeps its bracketed words in the key ("Potion of Healing (Greater)" is not the plain potion) unless they only count or measure ("Rations (1 day)"). The highest-priority version wins; a name with no match stays unlinked.

---

## 6. Token art mapping tables (`resources/icons/mapping.json`)

Six tables map words to game-icons names (schema `IconTables` in `packages/schema/src/icons.ts`; matching in `packages/rules/src/art/glyph.ts`). An excerpt:

```json
{
  "creatureType": { "undead": "skull", "fiend": "devil-mask", "humanoid": "cowled", "…": "…" },
  "ancestry": { "Dragon": "dragon-head", "Golem": "golem-head", "Lycanthrope": "werewolf", "…": "…" },
  "nameKeywords": { "goblin": "goblin-head", "wolf": "wolf-head", "mind flayer": "brain-tentacle", "…": "…" },
  "synonyms": { "ghoul": "zombie", "wraith": "ghost", "pit fiend": "devil", "young": "", "ancient": "", "…": "…" },
  "itemType": { "LA": "leather-armor", "HA": "breastplate", "P": "potion-ball", "$": "coins", "…": "…" },
  "spellSchool": { "A": "shield", "EV": "bright-explosion", "N": "death-skull", "…": "…" }
}
```

- `creatureType` is keyed by the lowercase creature type, `ancestry` by the monster's `<ancestry>` label (§2.2), and `itemType` and `spellSchool` by the codes in §2.7 and §2.8.
- `nameKeywords` keys are lowercase words or phrases matched as whole words in the name, plural `s`/`es` allowed, longest first.
- `synonyms` rewrites words before a second keyword pass: `"ghoul": "zombie"` replaces the word, and an empty value removes it (`"young": ""`), so `Young Red Dragon` can still match.

Matching order for a creature: `ancestry`, then name keywords, then name keywords after synonyms, then `creatureType`. Items try name keywords, then `itemType`; spells use `spellSchool`. Custom art and portraits always come first (§5.4); with no match, a token shows initials. Creatures that match nothing are logged to `Library/logs/icon-misses.txt` so the tables can grow.

Every icon name must exist in the fetched set: `pnpm verify:mapping` (run by `pnpm fetch:content`) fails on a missing name.
