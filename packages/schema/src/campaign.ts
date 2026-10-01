import { z } from 'zod';
import { Ability, Edition, IsoDateTime } from './common';
import { RecordRef } from './record';

/** Campaign folder objects (DESIGN.md §5.2, DATA-FORMATS.md §5.4). One JSON file per object. */

export const CAMPAIGN_SCHEMA_VERSION = 1;

const int = z.number().int();

export const PlayerOverlays = z.object({
  sceneTitle: z.boolean().default(true),
  initiativeStrip: z.boolean().default(true),
  pcHealthBars: z.boolean().default(false),
  roundCounter: z.boolean().default(true),
});

export const CampaignSettings = z.object({
  playerOverlays: PlayerOverlays.prefault({}),
  tokenStyle: z.enum(['engraved', 'flat', 'twoTone', 'plain']).default('engraved'),
  /** How creature HP appears on the player window. */
  hpDisplayMode: z.enum(['hidden', 'bloodied', 'exact']).default('bloodied'),
  /** Roll one initiative per identical group or one per creature (DESIGN.md §6.4). */
  initiativeMode: z.enum(['perGroup', 'perCreature']).default('perGroup'),
});

export const Campaign = z.object({
  schemaVersion: z.literal(CAMPAIGN_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  preferredEdition: Edition.default('2024'),
  allowLegacy: z.boolean().default(true),
  /** Null means every enabled source; otherwise the subset this campaign uses. */
  enabledSourceIds: z.array(z.string()).nullable().default(null),
  settings: CampaignSettings.prefault({}),
  activeAdventureId: z.string().nullable().default(null),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Campaign = z.infer<typeof Campaign>;

export const PCCard = z.object({
  schemaVersion: z.literal(CAMPAIGN_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  playerName: z.string().default(''),
  classText: z.string().default(''),
  level: int.min(1).max(20).default(1),
  maxHp: int.min(1).default(10),
  ac: int.default(10),
  initiativeBonus: int.default(0),
  speed: int.default(30),
  passives: z
    .object({
      perception: int.default(10),
      insight: int.default(10),
      investigation: int.default(10),
    })
    .prefault({}),
  spellSaveDc: int.optional(),
  saves: z.partialRecord(Ability, int).default({}),
  portrait: z.string().optional(),
  dndBeyondUrl: z.string().optional(),
  notes: z.string().default(''),
  tokenStyleOverride: z.enum(['engraved', 'flat', 'twoTone', 'plain']).optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type PCCard = z.infer<typeof PCCard>;

/** What a combatant or token points at (DESIGN.md §5.4). Names are cached for missing targets. */
export const EntityRef = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pc'), pcId: z.string(), name: z.string() }),
  z.object({ kind: z.literal('record'), ref: RecordRef, name: z.string() }),
  z.object({ kind: z.literal('npc'), npcId: z.string(), name: z.string() }),
  z.object({ kind: z.literal('custom'), name: z.string() }),
]);
export type EntityRef = z.infer<typeof EntityRef>;

export const CombatRole = z.enum(['ally', 'enemy', 'neutral']);
export type CombatRole = z.infer<typeof CombatRole>;

export const CombatantTemplate = z.object({
  id: z.string().min(1),
  ref: EntityRef,
  label: z.string().optional(),
  quantity: int.min(1).max(50).default(1),
  role: CombatRole.default('enemy'),
  hpOverride: int.min(1).optional(),
  hidden: z.boolean().default(false),
  tokenId: z.string().optional(),
  /** One map token per creature when quantity > 1, in numbering order; wins over `tokenId`. */
  tokenIds: z.array(z.string()).optional(),
  /** Display values cached from the record at add time (DESIGN.md difficultyCache). */
  cache: z
    .object({
      xp: int.min(0).default(0),
      cr: z.string().default(''),
      type: z.string().default(''),
      hp: int.min(0).default(0),
      ac: int.default(10),
    })
    .optional(),
});
export type CombatantTemplate = z.infer<typeof CombatantTemplate>;

export const ConditionDuration = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rounds'), remaining: int.min(0) }),
  z.object({ kind: z.literal('untilStartOfTurn'), combatantId: z.string() }),
  z.object({ kind: z.literal('untilEndOfTurn'), combatantId: z.string() }),
  z.object({ kind: z.literal('untilSave'), ability: Ability, dc: int }),
]);
export type ConditionDuration = z.infer<typeof ConditionDuration>;

export const ConditionInstance = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Exhaustion level 1–6; unused for other conditions. */
  level: int.min(1).max(6).optional(),
  duration: ConditionDuration.optional(),
  source: z.string().optional(),
  appliedRound: int.default(1),
});
export type ConditionInstance = z.infer<typeof ConditionInstance>;

export const Counter = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  max: int.min(0),
  current: int.min(0),
  resets: z.enum(['turn', 'shortRest', 'longRest', 'day', 'never']).default('never'),
  kind: z
    .enum(['legendary', 'legendaryResistance', 'uses', 'spellSlot', 'custom'])
    .default('custom'),
  featureName: z.string().optional(),
  /** Spell level for `spellSlot` counters (DESIGN.md §6.4 slot tracker). */
  level: int.min(1).max(9).optional(),
});
export type Counter = z.infer<typeof Counter>;

export const RechargeState = z.object({
  id: z.string().min(1),
  featureName: z.string().min(1),
  min: int.min(1).max(6),
  available: z.boolean().default(true),
});
export type RechargeState = z.infer<typeof RechargeState>;

export const Combatant = z.object({
  id: z.string().min(1),
  templateId: z.string().optional(),
  name: z.string().min(1),
  /** What the player window shows until revealed (creature type for monsters). */
  maskedName: z.string().min(1),
  revealed: z.boolean().default(false),
  ref: EntityRef,
  role: CombatRole,
  /** Null until rolled or entered. */
  initiative: z.number().nullable().default(null),
  initiativeBonus: int.default(0),
  dexterity: int.default(10),
  hp: z.object({ current: int, max: int.min(0), temp: int.min(0).default(0) }),
  ac: int.optional(),
  /** Save bonuses for the auto-rolled save call. */
  saves: z.partialRecord(Ability, int).default({}),
  damageVulnerabilities: z.array(z.string()).default([]),
  damageResistances: z.array(z.string()).default([]),
  damageImmunities: z.array(z.string()).default([]),
  conditionImmunities: z.array(z.string()).default([]),
  conditions: z.array(ConditionInstance).default([]),
  concentrating: z.object({ on: z.string(), since: int }).nullable().default(null),
  counters: z.array(Counter).default([]),
  recharges: z.array(RechargeState).default([]),
  deathSaves: z
    .object({ successes: int.min(0).max(3), failures: int.min(0).max(3) })
    .nullable()
    .default(null),
  dead: z.boolean().default(false),
  hidden: z.boolean().default(false),
  /** Delayed/readied: skipped by Next until released. */
  held: z.boolean().default(false),
  /** The "Lair" entry at initiative 20 (DESIGN.md §6.4). */
  isLair: z.boolean().default(false),
  tokenId: z.string().optional(),
  /** Stat block for the panel; absent for PCs and custom combatants. */
  recordId: z.string().optional(),
});
export type Combatant = z.infer<typeof Combatant>;

export const LogEntry = z.object({
  id: z.string().min(1),
  at: IsoDateTime,
  round: int.min(0),
  kind: z.enum(['roll', 'attack', 'damage', 'heal', 'condition', 'turn', 'save', 'death', 'note']),
  text: z.string(),
  actorId: z.string().optional(),
  /** Free-form detail (dice faces, totals) for the log view. */
  detail: z.record(z.string(), z.unknown()).optional(),
});
export type LogEntry = z.infer<typeof LogEntry>;

export const CombatState = z.object({
  round: int.min(0),
  /** Index into `combatants` of the active entry; -1 before the first turn. */
  turnIndex: int.min(-1),
  combatants: z.array(Combatant),
  log: z.array(LogEntry).default([]),
  lairInitiative: int.optional(),
  startedAt: IsoDateTime,
});
export type CombatState = z.infer<typeof CombatState>;

export const EncounterResult = z.object({
  endedAt: IsoDateTime,
  rounds: int.min(0),
  xpEarned: int.min(0),
  casualties: z.array(z.string()),
  /** The fight's log, kept so it stays exportable after combat ends (DESIGN.md §6.4). */
  log: z.array(LogEntry).default([]),
});
export type EncounterResult = z.infer<typeof EncounterResult>;

export const Encounter = z.object({
  schemaVersion: z.literal(CAMPAIGN_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  sceneId: z.string().optional(),
  combatants: z.array(CombatantTemplate).default([]),
  notes: z.string().default(''),
  /** Live combat, autosaved on every change; null between fights. */
  state: CombatState.nullable().default(null),
  results: z.array(EncounterResult).default([]),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Encounter = z.infer<typeof Encounter>;

// ---------- adventures, notes, NPCs (DESIGN.md §5.2) ----------

export const EntityLink = z.object({
  kind: z.enum(['npc', 'scene', 'encounter', 'record', 'note', 'pc']),
  id: z.string(),
  name: z.string(),
});
export type EntityLink = z.infer<typeof EntityLink>;

export const Adventure = z.object({
  schemaVersion: z.literal(CAMPAIGN_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().default(''),
  sceneIds: z.array(z.string()).default([]),
  encounterIds: z.array(z.string()).default([]),
  noteIds: z.array(z.string()).default([]),
  order: int.default(0),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Adventure = z.infer<typeof Adventure>;

export const Note = z.object({
  schemaVersion: z.literal(CAMPAIGN_SCHEMA_VERSION),
  id: z.string().min(1),
  title: z.string().min(1),
  /** Markdown. */
  body: z.string().default(''),
  tags: z.array(z.string()).default([]),
  links: z.array(EntityLink).default([]),
  /** Place in the campaign's note list. Notes written before reordering existed share 0. */
  order: int.default(0),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Note = z.infer<typeof Note>;

export const NPC = z.object({
  schemaVersion: z.literal(CAMPAIGN_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  /** Stat block, when the NPC has one (any monster record). */
  recordRef: RecordRef.optional(),
  portrait: z.string().optional(),
  role: z.string().default(''),
  location: z.string().default(''),
  notes: z.string().default(''),
  isAlive: z.boolean().default(true),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type NPC = z.infer<typeof NPC>;

// ---------- scenes (DESIGN.md §5.2, §6.5) ----------

export const SceneKind = z.enum(['folder', 'title', 'image', 'map', 'blankGrid']);
export type SceneKind = z.infer<typeof SceneKind>;

export const SceneImage = z.object({
  /** Campaign-relative paths (`images/<id>.png`, `images/<id>.display.jpg`). */
  path: z.string(),
  displayPath: z.string(),
  width: int.positive(),
  height: int.positive(),
});
export type SceneImage = z.infer<typeof SceneImage>;

/** One art variant of a map (day, night, burning); grid, tokens and markers are shared. */
export const SceneBackground = z.object({
  id: z.string().min(1),
  name: z.string(),
  image: SceneImage,
});
export type SceneBackground = z.infer<typeof SceneBackground>;

export const GridSpec = z.object({
  cellPx: z.number().positive().default(70),
  offsetX: z.number().default(0),
  offsetY: z.number().default(0),
  color: z.string().default('#000000'),
  opacity: z.number().min(0).max(1).default(0.3),
  showToPlayers: z.boolean().default(true),
});
export type GridSpec = z.infer<typeof GridSpec>;

export const Token = z.object({
  id: z.string().min(1),
  kind: z.enum(['pc', 'creature', 'marker']),
  ref: EntityRef,
  label: z.string(),
  /** Grid units, fractional allowed. */
  x: z.number(),
  y: z.number(),
  footprint: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(1),
  role: CombatRole.default('enemy'),
  hidden: z.boolean().default(false),
  nameMasked: z.boolean().default(true),
  /** What the TV shows while masked (creature type), cached at placement. */
  maskedLabel: z.string().optional(),
  /** Campaign-relative image path for custom art; absent = generated disc. */
  art: z.string().optional(),
  /** game-icons glyph name chosen at placement (DESIGN.md §6.8); absent = initials. */
  glyph: z.string().optional(),
  color: z.string().optional(),
  dead: z.boolean().default(false),
});
export type Token = z.infer<typeof Token>;

export const EntryMarker = z.object({
  id: z.string().min(1),
  name: z.string(),
  x: z.number(),
  y: z.number(),
});
export type EntryMarker = z.infer<typeof EntryMarker>;

export const PlayerCamera = z.object({
  mode: z.enum(['fitMap', 'fitTokens', 'follow', 'manual']).default('fitMap'),
  x: z.number().default(0),
  y: z.number().default(0),
  zoom: z.number().positive().default(1),
});
export type PlayerCamera = z.infer<typeof PlayerCamera>;

export const Scene = z.object({
  schemaVersion: z.literal(CAMPAIGN_SCHEMA_VERSION),
  id: z.string().min(1),
  kind: SceneKind,
  title: z.string().min(1),
  subtitle: z.string().default(''),
  /** Null = follow the campaign's scene-title overlay setting. */
  showTitleOverride: z.boolean().nullable().default(null),
  parentId: z.string().nullable().default(null),
  order: int.default(0),
  notes: z.string().default(''),
  /** The art shown now; on a map with `backgrounds`, a copy of the active one's image. */
  image: SceneImage.optional(),
  /** Map scenes: saved art variants to switch between. Absent = just `image`. */
  backgrounds: z.array(SceneBackground).optional(),
  activeBackgroundId: z.string().optional(),
  backdrop: z.enum(['parchment', 'stone', 'dark']).optional(),
  grid: GridSpec.optional(),
  /** Blank-grid scenes: size in cells. */
  blank: z
    .object({ cols: int.min(1).max(200).default(30), rows: int.min(1).max(200).default(20) })
    .optional(),
  tokens: z.array(Token).default([]),
  entryMarkers: z.array(EntryMarker).default([]),
  audio: z
    .object({ playlistId: z.string().optional(), ambienceIds: z.array(z.string()).default([]) })
    .optional(),
  encounterId: z.string().optional(),
  playerCamera: PlayerCamera.prefault({}),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Scene = z.infer<typeof Scene>;
