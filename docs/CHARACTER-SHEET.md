# Character sheet: dev list

What a player's character sheet could do next, from an audit of other 5e character sheets (web, desktop and mobile) on 2026-11-24, measured against what Trifold's sheet does today (ADR 0068, 0069, 0073 to 0075, 0078, 0080). Nothing here is decided. Each item says what other sheets commonly do, what Trifold has now, and what it would take. Ian picks what moves into a plan.

**Sizes:** S is about one PR, M is one or two, L is three or more. **Priority** is a first suggestion: A next, B after, C later or maybe never.

## Already built

So the list below does not repeat it:

- **Numbers:** abilities, saves, skills with proficiency and expertise, AC, initiative, speed, passives, spell save DC and attack, all worked out with overrides.
- **Rolling** from the sheet, with advantage and disadvantage, to the table or private.
- **Resources:** spell slots, limited-use features with short or long rest, hit dice with Spend, Heroic Inspiration, both rests with Undo, and Cast spending a slot.
- **Spells** by level with prepared, and a prepared-only filter.
- **Linked rows:** spells, features and items open their compendium text.
- **Equipment:** name and quantity, plus gold.
- **Forms** (reference stat blocks), companions from the table, and sharing the sheet with the GM's Trifold.
- **Character files:** JSON export and import, Import from PDF, and the guided builder with Level up.

**The table owns some things on purpose** (PLAYER-MODE.md, Who owns what): current HP, temp HP, death saves and conditions. The sheet shows them while connected and does not keep its own copy.

**Built since:** items 1 to 5, 20 and 21 (ADR 0081): equipped (with AC from equipped armour and shields), attunement, places, coins, item charges, defences, senses and other speeds. Spells and equipment are also added, changed and removed in their own tabs (ADR 0082).

## Inventory and equipment

| # | Item | Other sheets | Trifold now | Work | Size | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Equipped** toggle per item | Common. Equipped armour, shields and items feed AC and attacks. | None. AC comes from a separate armour setting. | Optional `equipped` on an item. The decision is whether equipped armour and shield set AC, replacing `sheet.armor`. That touches the builder, PDF import and Level up. | S without AC, L with | A (decide AC first) |
| 2 | **Attunement**, with a count of 3 | Common. An "Attuned 2 of 3" count; some tie it to equipping. | None | Optional `attuned`; a header count; a warning past the limit. | S | A |
| 3 | **Where an item is kept**: on you, a backpack, a mount, a stash at home | Common, as nested containers, a mount with its own capacity, and coins kept in a container. | None | Optional `location` (free text or a container item's id); group the list by it. | M | A |
| 4 | **Coins**: CP, SP, EP, GP, PP | Universal | GP only, as one number | `coins: { cp, sp, ep, gp, pp }` beside `gp`, with a migration or a read-time default. Show a total in GP. | S | A |
| 5 | **Magic item charges**, with recharge (dawn, a rest, never) | Common | None (features have uses; items do not) | `uses` on an item like a feature's, with a `dawn` reset. Pips on the row; rests refill them. | S | A |
| 6 | **Consumables and ammunition** count down when used | Common: a potion's quantity drops on use; ammunition drops on an attack. | Quantity is edited by hand only | A use action on consumables. Optionally, an attack names its ammunition item and spends one per roll. | S to M | B |
| 7 | **Weight and encumbrance** | Common, often switchable, and often criticised for being all or nothing | None | Item weight from the compendium record or typed; carrying capacity from Strength and size; a switch per character. | M | B |
| 8 | **Item value and notes** | Common | Compendium text only | Optional `notes` and `value` on an item. | S | C |

## Actions

| # | Item | Other sheets | Trifold now | Work | Size | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| 9 | **Actions grouped by what they cost**: All, Attack, Action, Bonus action, Reaction, Other | Common, as a filter row on the actions tab | Attacks only, as a table | An action type on features and attacks; spells read theirs from casting time. Filter chips on the Actions tab. | M | A |
| 10 | **Custom actions**: the player writes an action with its roll | Common | Free-text features only | A feature with an optional roll expression and action type. | M | B |
| 11 | **Attack and damage in one roll**, critical hits doubling the dice, versatile and two-handed damage, extra damage riders | Common: "always roll damage" and automatic crit dice | Attack and damage roll separately | A combined roll option; double the dice on a natural 20; a second damage line per attack. | M | B |
| 12 | **Weapon properties and mastery** (2024) shown on the attack | Common on 2024 sheets | In the linked item's text only | Read them from the record; show them as small labels. | S | B |

## Spells

| # | Item | Other sheets | Trifold now | Work | Size | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| 13 | **Upcasting** with a higher slot | Common | Cast spends the spell's own level only | A slot-level choice on Cast, and the higher-level damage from the record where it can be read. | M | A |
| 14 | **Concentration**: what you are concentrating on, a warning when you cast a second, a Constitution save when hit | Common, often with a prompt or note when concentration starts, switches or ends | None | Mark concentration from a cast (the record says whether a spell needs it); show it in the turn bar; at the table, prompt the save when the table records damage. | M | A |
| 15 | **Spell details on the row**: ritual, concentration, casting time, range, components | Common | Only when the row is opened | Badges and a short line read from the record. | S | A |
| 16 | **Preparation count**: "Prepared 7 of 9" | Common | None | The limit from class, level and ability (the builder already knows it); show it on Spells. | S | B |
| 17 | **Always-prepared spells** (domain and subclass), and a spellbook as a list apart from prepared | Common | The `prepared` flag only | An `always` flag on a spell; for wizards, a known versus prepared view. | S to M | B |
| 18 | **Pact Magic shown as its own pool** | Common | A rest switch on the slots | Show warlock slots as one pool with their level. | S | C |
| 19 | **Costly or consumed material components** | Some | In the record's text only | A flag and a note; it could spend the item. | S | C |

## Defences, senses and state

| # | Item | Other sheets | Trifold now | Work | Size | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | **Resistances, immunities, vulnerabilities, condition immunities** | Common, as a Defences block | None | Lists on the sheet, typed or from species and features. Shown under the tiles. | S | A |
| 21 | **Senses and other speeds**: darkvision, blindsight, tremorsense; fly, swim, climb, burrow | Common | Walking speed only; senses in feature text | `senses` and `speeds` on the sheet; shown beside Speed. | S | A |
| 22 | **Exhaustion applied to rolls** (2024: minus 2 per level on d20 tests, slower speed) | Common on 2024 sheets, some applying it automatically | The table tracks exhaustion as a condition | Read the table's exhaustion level and apply it to the sheet's rolls and speed while connected. | M | B |
| 23 | **Situational effects you turn on and off**: Bless, Rage, a magic weapon's bonus, applying to rolls | Common in the most automated sheets (toggled effects that change numbers without editing the sheet) | Overrides only, which are permanent | An effects model: a named effect with changes to numbers, toggled on the sheet. It is the largest item here, and SRD data rarely describes effects in a form a program can read. | L | C |
| 24 | **Death saves on the sheet** at 0 HP | Universal | The table's, on purpose | Show the table's death saves in the turn bar while at 0 HP, read only, or send them as intents if the table allows it. | S | B |

## Who the character is

| # | Item | Other sheets | Trifold now | Work | Size | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| 25 | **Personality traits, ideals, bonds, flaws** (2014), **appearance, backstory, allies** | Universal | One free-text notes field | Named text fields, each optional, on a "Character" tab. | S | B |
| 26 | **Portrait** | Common | None on the character (PC cards have portraits) | An image in the Library, shared with the GM's PC card. | M | B |
| 27 | **Alignment, size, age, height, faith** and similar details | Common | Size in the builder record only | Optional fields beside the above. | S | C |
| 28 | **XP or milestone tracking**, with a prompt to level up | Common | Level up exists; no XP | Optional `xp` and the 2024 XP table; a nudge when there is enough. | S | C |
| 29 | **Languages and tool proficiencies as lists** rather than text | Common | One free-text line, now shown as labelled lines | Structured lists; keep the text line for anything else. | S | C |

## Output and other places

| # | Item | Other sheets | Trifold now | Work | Size | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| 30 | **Print or export to PDF** | Common | None | A print layout of the sheet; Electron prints to PDF without a new dependency. | M | B |
| 31 | **The full sheet on a phone** | Common in mobile apps | The phone page shows a summary | The same sheet at the phone page's width (it already works from 480 px). | L | C |
| 32 | **Favourites or an "on my turn" view** | Some | The Actions tab | Pin attacks, spells and features to the top of Actions. | M | C |

## The editor

| # | Item | Other sheets | Trifold now | Work | Size | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| 33 | **Rework the editor** (Edit, and Library › Characters) | Builders and sheets edit in place, section by section, with controls sized to what they hold | One long page of every section, with text boxes and number fields that do not fit what they hold (Ian, 2026-11-24: "a super long wall of text … needs to be totally reworked") | Its own short plan first: probably the sheet's own tabs in an editing state, or sections that open one at a time, with fields sized to their content and the in-tab editing of ADR 0082 as the pattern. | L | A |

## Not for Trifold

- **Buying or unlocking content inside the sheet, or importing from an online service.** These break ground rules 1 and 3. Content comes from SRD files and what the user imports.
- **Drag a monster or item onto the sheet to apply its effects.** This needs the effects model in item 23 first.

## Suggested first plan

If the A items go ahead, one coherent first step is "Equipment and defences": items 1 to 5, 20 and 21, with the AC decision made up front, then "Spells at the table": 13 to 15. Actions grouping (9) is a good third step, because it touches features, attacks and spells together.
