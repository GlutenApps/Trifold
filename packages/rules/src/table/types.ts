import type { FogShapeLike } from '../fog';

/**
 * The player connector's data (docs/PLAYER-CONNECTOR.md, ADR 0043). The console pushes a
 * `TableSnapshot` to main; main turns it into one `ServerMessage` per device with `viewFor`, so
 * each browser receives only what it may see.
 */

export type Role = 'ally' | 'enemy' | 'neutral';
export type CreatureKind = 'pc' | 'npc';
/** A creature a phone can work on: a claimed PC or NPC, or a summon (Phase 4), which belongs to
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
   * stands: what a drop's stale check compares against (Phase 3).
   */
  restsAt?: { x: number; y: number };
}

/** The map scene live on the TV, or nothing. */
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
  /** `fogKey(fog)`: which fogged map image goes with this state. */
  fogKey: string;
  tokenStyle: 'engraved' | 'flat' | 'twoTone' | 'plain';
  tokens: TableToken[];
}

/** A condition on a creature in the loaded fight; `id` is what removing it names. */
export interface CreatureCondition {
  id: string;
  name: string;
  level?: number;
}

/** A creature's numbers and what its owner may change (Phase 2 plan, "How a player's edit travels"). */
export interface CreatureStats {
  hp: { current: number; max: number; temp: number } | null;
  ac: number | null;
  conditions: CreatureCondition[];
  /** It has a combatant in the loaded fight. */
  inFight: boolean;
  /** The loaded fight is waiting for its initiative (decision 8). */
  needsInitiative: boolean;
  editable: { hp: boolean; maxHp: boolean; ac: boolean; conditions: boolean };
}

/** A PC card or NPC offered to players, with what its owner may see. */
export interface TableCreature extends CreatureStats {
  kind: AnyCreatureKind;
  id: string;
  name: string;
  portraitSrc?: string;
  /** Offered in the picker now (decision 13); a claimed creature keeps its claim either way. */
  claimable: boolean;
  /** An NPC kept as a PC's companion (Phase 3): claimed and released with that PC. */
  companionOf?: string;
  /** A summon's owner and state (Phase 4). */
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

/** A creature the DM made summonable for this campaign (Phase 4). */
export interface SummonOption {
  key: string;
  name: string;
  type: string;
  ac: number | null;
  hp: number | null;
}

export type SummonMode = 'on' | 'approval' | 'off';

/** What the phone asks for when it summons (Phase 4 plan, "Add options"). */
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

export interface TableSnapshot {
  campaignId: string;
  campaignName: string;
  scene: TableScene | null;
  /** What the TV shows when it is not a map: a title card, an image or the break screen. */
  screen?: TableScreen | null;
  creatures: TableCreature[];
  /** The DM's summon list (Phase 4). */
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
  /** Under fog: only ever sent to its owner (decision 12). */
  fogged?: boolean;
  /** Another device is dragging it: its name (Phase 3). */
  movingBy?: string;
}

export interface ClientMap {
  id: string;
  title: string;
  width: number;
  height: number;
  backdrop: 'parchment' | 'stone' | 'dark';
  /** The fogged map image (decision 11), absent until the console has drawn it. */
  imageUrl?: string;
  grid: TableGrid;
  fog: FogShapeLike[] | null;
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
  mine: CreatureView[];
  /** Empty while the device holds creatures; the picker is for devices with none. */
  picker: PickerEntry[];
  map: ClientMap | null;
  /** The TV's other screens, when no map is up (title, image, break). */
  screen?: ClientScreen | null;
  /** The campaign's reclaim mode, so the picker knows to ask for a PIN or to wait. */
  reclaimMode: ReclaimMode;
  /** Summoning (Phase 4): what can be added, whether it may, and how many per character. */
  summoning?: { mode: SummonMode; cap: number; options: SummonOption[] };
}

/** A player's change to one of their creatures (Phase 2 plan). HP and temp HP are changes. */
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
  /** Sent on connect, so the browser answers with the token it stored for this campaign. */
  | { type: 'campaign'; campaignId: string; campaignName: string }
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
  | { type: 'closed' };

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
  /** Movement (Phase 3): ask to drag, show where it is, keep the lock, put it down or let go. */
  | { type: 'grab'; tokenId: string }
  /** Where the token is planned to go; `from` is where the move began, for the TV's ruler. */
  | { type: 'preview'; tokenId: string; x: number; y: number; from?: { x: number; y: number } }
  | { type: 'hold'; tokenId: string }
  | { type: 'drop'; tokenId: string; x: number; y: number; from: { x: number; y: number } }
  | { type: 'letGo'; tokenId: string }
  /** Release one companion on its own. */
  | { type: 'releaseOne'; creatureKind: CreatureKind; creatureId: string }
  /** Summoning (Phase 4): bring creatures into play, take one out, keep one after concentration. */
  | ({ type: 'summon' } & SummonRequest)
  | { type: 'dismiss'; tokenId: string }
  | { type: 'keepSummon'; tokenId: string };

/** What main hands the console to do about summons (Phase 4). */
export type TableSummonEvent =
  | ({ kind: 'spawn'; deviceLabel: string } & SummonRequest)
  | { kind: 'dismiss'; tokenId: string; deviceLabel: string }
  | { kind: 'keep'; tokenId: string };

/** What main hands the console about a token being moved by a player (Phase 3). */
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
