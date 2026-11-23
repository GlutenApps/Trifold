import type { AreaOutline } from '../areaShapes';
import type { TableRoll } from './rolls';
import type { FogShapeLike } from '../fog';
import type { TableNumbers } from '@trifold/schema';

/**
 * A player's character's table numbers offered to the GM's PC card (docs/PLAYER-MODE.md, Sheet
 * updates; ADR 0071): its name, the numbers field for field, and its sheet link.
 */
export interface SheetOffer {
  name: string;
  numbers: TableNumbers;
  sheetUrl?: string;
}

/**
 * The player connector's data (docs/PLAYER-CONNECTOR.md, ADR 0043). The console pushes a
 * `TableSnapshot` to main; main turns it into one `ServerMessage` per device with `viewFor`, so
 * each browser receives only what it may see.
 */

export type Role = 'ally' | 'enemy' | 'neutral';
export type CreatureKind = 'pc' | 'npc';
/** A creature a phone can work on: a claimed PC or NPC, or a summon, which belongs to
 *  whoever holds its owner and is never claimed itself. A summon's id is its token's id. */
export type AnyCreatureKind = CreatureKind | 'summon';

export interface TableGrid {
  cellPx: number;
  offsetX: number;
  offsetY: number;
  color: string;
  opacity: number;
  visible: boolean;
}

/** A token on the live map, unfiltered: the server decides who sees it. */
export interface TableToken {
  id: string;
  kind: 'pc' | 'creature' | 'marker';
  x: number;
  y: number;
  footprint: 1 | 2 | 3 | 4;
  /** The label the TV shows (masked names already applied). */
  label: string;
  role: Role;
  hidden: boolean;
  dead: boolean;
  color?: string;
  /** `trifold-media://` URLs; main reads the files and serves them under its own paths. */
  artSrc?: string;
  glyphSrc?: string;
  /** The PC card or NPC this token stands for, when it is one. */
  creature?: { kind: AnyCreatureKind; id: string };
  /**
   * While a player drags it, `x` and `y` are where the drag is and this is where the token
   * stands: what a drop's stale check compares against.
   */
  restsAt?: { x: number; y: number };
}

/** The map scene live on the TV, or nothing. */
/** An area shape (ADR 0050), as every screen draws it. */
export interface TableArea {
  label: string;
  outline: AreaOutline;
  squares: Array<{ x: number; y: number }>;
}

export interface TableScene {
  id: string;
  title: string;
  width: number;
  height: number;
  backdrop: 'parchment' | 'stone' | 'dark';
  /** Whether the scene has a map image (a blank grid has none). */
  hasImage: boolean;
  grid: TableGrid;
  /** The fog when it is on; null when it is off or the scene has none. */
  fog: { enabled: true; shapes: FogShapeLike[] } | null;
  /** The DM's area shape on this map (ADR 0050): outline, covered squares and reading. */
  area?: TableArea;
  /** `mapImageKey(fog, image)`: which map image (picture and fog) goes with this state. */
  imageKey: string;
  tokenStyle: 'engraved' | 'flat' | 'twoTone' | 'plain';
  tokens: TableToken[];
}

/** A condition on a creature in the loaded fight; `id` is what removing it names. */
export interface CreatureCondition {
  id: string;
  name: string;
  level?: number;
}

/**
 * A creature's numbers and what its owner may change (PLAYER-CONNECTOR.md, "How a player's edit
 * travels").
 */
export interface CreatureStats {
  hp: { current: number; max: number; temp: number } | null;
  ac: number | null;
  conditions: CreatureCondition[];
  /** It has a combatant in the loaded fight. */
  inFight: boolean;
  /** The loaded fight is waiting for its initiative (PLAYER-CONNECTOR.md, "Initiative"). */
  needsInitiative: boolean;
  /**
   * Its place in the loaded fight's turn order, when it is one of these two: `now` on its turn,
   * `next` when Next turn would move to it. Only ever sent to the device that holds the creature
   * (PLAYER-CONNECTOR.md, "Your turn"), whether or not the TV shows the initiative strip.
   */
  turn?: 'now' | 'next';
  editable: { hp: boolean; maxHp: boolean; ac: boolean; conditions: boolean };
}

/** A PC card or NPC offered to players, with what its owner may see. */
export interface TableCreature extends CreatureStats {
  kind: AnyCreatureKind;
  id: string;
  name: string;
  portraitSrc?: string;
  /**
   * Offered in the picker now (PLAYER-CONNECTOR.md, "What can be claimed"); a claimed creature
   * keeps its claim either way.
   */
  claimable: boolean;
  /** An NPC kept as a PC's companion: claimed and released with that PC. */
  companionOf?: string;
  /** A summon's owner and state. */
  summon?: TableSummon;
}

export interface TableSummon {
  owner: { kind: CreatureKind; id: string };
  /** What it is, for the Companions tool's row ("Beast"). */
  type: string;
  persistent: boolean;
  /** Its owner's concentration broke and it was tied to it: the phone asks whether to remove it. */
  concentrationLost: boolean;
}

/** A creature the DM made summonable for this campaign. */
export interface SummonOption {
  key: string;
  name: string;
  type: string;
  ac: number | null;
  hp: number | null;
}

export type SummonMode = 'on' | 'approval' | 'off';

/** What the phone asks for when it summons (PLAYER-CONNECTOR.md, "Add options"). */
export interface SummonRequest {
  ownerKind: CreatureKind;
  ownerId: string;
  optionKey: string;
  count: number;
  initiative: 'shared' | 'own';
  /** Rounds it lasts in a fight; absent, until dismissed. */
  rounds?: number;
  concentration: boolean;
  persistent: boolean;
}

/** One chip of the TV's initiative strip, as the players see it (masked names, no hidden). */
export interface TableInitiativeEntry {
  id: string;
  name: string;
  role: 'ally' | 'enemy' | 'neutral';
  isPc: boolean;
  dead: boolean;
  /** 0–1, PCs only, and only when the health-bar overlay is on. */
  hpFraction?: number;
  bloodied: boolean;
}

/** A counter on the TV (ADR 0019). */
export interface TableCounter {
  id: string;
  name: string;
  value: number;
  max?: number;
  bound: 'min' | 'max' | null;
}

/** The timer on the TV (ADR 0021); `endsAt` is on the DM's clock. */
export interface TableTimer {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'paused' | 'done';
  endsAt?: number;
  leftMs: number;
}

/**
 * What the TV shows over the scene (ADR 0046), the same for every device: each part only while
 * its overlay switch is on, and nothing behind a blackout.
 */
export interface TableOverlays {
  /** The scene's name over a map or image, when the TV shows it. */
  sceneTitle?: string;
  /** The initiative strip: whose turn it is and the order, as the TV shows it. */
  initiative?: { round: number; activeId: string | null; entries: TableInitiativeEntry[] };
  healthBars: boolean;
  /** The round, while a fight is on and the round counter overlay is on. */
  round?: number;
  timer: TableTimer | null;
  counters: TableCounter[];
}

export interface TableSnapshot {
  campaignId: string;
  campaignName: string;
  /**
   * Changes whenever what the campaign shares with its players may have (ADR 0060): the DM's
   * choices and which NPCs point at which stat blocks. Main reads the content itself.
   */
  sharedKey?: string;
  /**
   * Whether the DM is live (ADR 0046). Not live, phones get no map and no screen and say they
   * are waiting; absent counts as live.
   */
  live?: boolean;
  scene: TableScene | null;
  /** What the TV shows when it is not a map: a title card, an image or the break screen. */
  screen?: TableScreen | null;
  /** What the TV shows over the scene; absent when not live or blacked out. */
  overlays?: TableOverlays;
  creatures: TableCreature[];
  /** The DM's summon list. */
  summonOptions?: SummonOption[];
}

export interface Claim {
  creatureKind: CreatureKind;
  creatureId: string;
  deviceId: string;
}

// ---------- what a browser receives ----------

export interface ClientToken {
  id: string;
  kind: 'pc' | 'creature' | 'marker';
  x: number;
  y: number;
  footprint: 1 | 2 | 3 | 4;
  label: string;
  role: Role;
  dead: boolean;
  color?: string;
  artUrl?: string;
  glyphUrl?: string;
  /** One of this device's creatures. */
  mine: boolean;
  /** Under fog: only ever sent to its owner (PLAYER-CONNECTOR.md, "Server-side filtering"). */
  fogged?: boolean;
  /** Another device is dragging it: its name. */
  movingBy?: string;
}

export interface ClientMap {
  id: string;
  title: string;
  width: number;
  height: number;
  backdrop: 'parchment' | 'stone' | 'dark';
  /** Whether the scene has a map picture (a blank grid has none), so a phone can show it loading. */
  hasImage: boolean;
  /**
   * The fogged map image (PLAYER-CONNECTOR.md, "The fogged map image"), absent until the console
   * has drawn it.
   */
  imageUrl?: string;
  grid: TableGrid;
  fog: FogShapeLike[] | null;
  /** The DM's area shape (ADR 0050), drawn under the fog. */
  area?: TableArea;
  tokenStyle: 'engraved' | 'flat' | 'twoTone' | 'plain';
  tokens: ClientToken[];
}

export interface CreatureView extends CreatureStats {
  kind: AnyCreatureKind;
  id: string;
  name: string;
  portraitUrl?: string;
  /** Its token on the live map, when the device can see it there. */
  tokenId?: string;
  /** The DM has locked its movement (everyone's, or this creature's). */
  movementLocked: boolean;
  /** The PC it is a companion of, when it is one. */
  companionOf?: string;
  summon?: TableSummon;
}

export interface PickerEntry {
  kind: CreatureKind;
  id: string;
  name: string;
  portraitUrl?: string;
  /** Claimed by another device. */
  inUse: boolean;
  /** The device holding it is connected now: tapping it is a takeover, not a reclaim. */
  holderOnline: boolean;
}

/** How a claimed character is got back (Claiming, reclaiming and releasing). */
export type ReclaimMode = 'open' | 'pin' | 'approval';

export interface ClientView {
  campaignName: string;
  /** Whether the DM is live (ADR 0046); not live, the phone waits instead of showing the table. */
  live: boolean;
  mine: CreatureView[];
  /** Empty while the device holds creatures; the picker is for devices with none. */
  picker: PickerEntry[];
  map: ClientMap | null;
  /** The TV's other screens, when no map is up (title, image, break). */
  screen?: ClientScreen | null;
  /** The TV's overlays (scene title, initiative, round, timer, counters), as the TV shows them. */
  overlays?: TableOverlays;
  /** The campaign's reclaim mode, so the picker knows to ask for a PIN or to wait. */
  reclaimMode: ReclaimMode;
  /** Summoning: what can be added, whether it may, and how many per character. */
  summoning?: { mode: SummonMode; cap: number; options: SummonOption[] };
}

/** A player's change to one of their creatures. HP and temp HP are changes. */
export type TableIntent =
  | { kind: 'hp'; delta: number }
  | { kind: 'temp'; delta: number }
  /** Temp HP set to a value (0 clears it): temp HP never stacks, so this is safe absolute. */
  | { kind: 'setTemp'; value: number }
  | { kind: 'maxHp'; value: number }
  | { kind: 'ac'; value: number }
  | { kind: 'addCondition'; name: string; level?: number }
  | { kind: 'removeCondition'; id: string }
  | { kind: 'initiative'; value: number };

export type ServerMessage =
  /**
   * Sent on connect, so the browser answers with the token it stored for this campaign. `now` is
   * the DM's clock, so a phone can count down to the DM's times (the break timer) on its own.
   */
  | { type: 'campaign'; campaignId: string; campaignName: string; now: number }
  | ({ type: 'state' } & ClientView)
  /** A new device token, sent once right after a first claim. */
  | { type: 'token'; token: string; campaignId: string }
  | { type: 'error'; message: string }
  /** Approval mode: the DM has been asked. */
  | { type: 'waiting'; creatureName: string }
  /** Switch character released these; Undo takes them back for a few seconds. */
  | { type: 'released'; names: string[]; undoMs: number }
  /** A drag this device started may go on. */
  | { type: 'grabbed'; tokenId: string }
  /** A drag is over without moving the token: refused, expired or taken by the DM. */
  | { type: 'dragEnded'; tokenId: string; reason: string }
  /** The DM pressed Stop or closed the campaign. */
  | { type: 'closed' }
  /** A roll made at the table (ADR 0059), sent to every device holding a creature. */
  | { type: 'rolled'; roll: TableRoll }
  /**
   * What the campaign shares with its players changed, or this is what it is now (ADR 0060):
   * a player's Trifold holding a different hash fetches `/shared`. Empty means nothing is shared.
   */
  | { type: 'shared'; hash: string }
  /** The GM took (or kept their own) numbers a `sheetOffer` sent (ADR 0071). */
  | { type: 'sheetAnswer'; accepted: boolean };

export type ClientMessage =
  | { type: 'hello'; token?: string }
  /** A first claim, a reclaim or a takeover: the server decides which. */
  | {
      type: 'claim';
      creatureKind: CreatureKind;
      creatureId: string;
      label?: string;
      pin?: string;
    }
  | { type: 'intent'; creatureKind: AnyCreatureKind; creatureId: string; intent: TableIntent }
  /** Switch character: release everything this device holds. */
  | { type: 'switch' }
  | { type: 'undo' }
  /** Stop waiting for the DM's approval. */
  | { type: 'cancel' }
  /** Movement: ask to drag, show where it is, keep the lock, put it down or let go. */
  | { type: 'grab'; tokenId: string }
  /** Where the token is planned to go; `from` is where the move began, for the TV's ruler. */
  | { type: 'preview'; tokenId: string; x: number; y: number; from?: { x: number; y: number } }
  | { type: 'hold'; tokenId: string }
  | { type: 'drop'; tokenId: string; x: number; y: number; from: { x: number; y: number } }
  | { type: 'letGo'; tokenId: string }
  /** Release one companion on its own. */
  | { type: 'releaseOne'; creatureKind: CreatureKind; creatureId: string }
  /** Summoning: bring creatures into play, take one out, keep one after concentration. */
  | ({ type: 'summon' } & SummonRequest)
  | { type: 'dismiss'; tokenId: string }
  | { type: 'keepSummon'; tokenId: string }
  /** A Table roll (ADR 0059): the roller's syntax; the DM's Trifold makes the roll. */
  | { type: 'roll'; expression: string }
  /** The held PC's numbers from the player's linked character, for the GM to accept (ADR 0071). */
  | { type: 'sheetOffer'; creatureId: string; offer: SheetOffer };

/** What main hands the console to do about summons. */
export type TableSummonEvent =
  | ({ kind: 'spawn'; deviceLabel: string } & SummonRequest)
  | { kind: 'dismiss'; tokenId: string; deviceLabel: string }
  | { kind: 'keep'; tokenId: string };

/** What main hands the console about a token being moved by a player. */
export type TableTokenEvent =
  | {
      kind: 'preview';
      tokenId: string;
      x: number;
      y: number;
      deviceLabel: string;
      /** Where the move began: the TV draws the ruler from here. */
      from?: { x: number; y: number };
    }
  | { kind: 'previewEnd'; tokenId: string }
  | { kind: 'move'; tokenId: string; x: number; y: number; deviceLabel: string };

/** The TV's non-map screens, as the console pushes them (player connector, all screen types). */
export type TableScreen =
  | {
      kind: 'title';
      id: string;
      title: string;
      subtitle?: string;
      backdrop: 'parchment' | 'stone' | 'dark';
    }
  | { kind: 'image'; id: string; title: string; src: string; width: number; height: number }
  | { kind: 'break'; title: string; subtitle?: string; endsAt?: number };

/** The same, as a phone receives it: an image scene's picture by the server's own path. */
export type ClientScreen =
  | Extract<TableScreen, { kind: 'title' | 'break' }>
  | { kind: 'image'; id: string; title: string; imageUrl: string; width: number; height: number };
