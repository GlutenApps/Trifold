import type { FogShapeLike } from '../fog';

/**
 * The player connector's data (docs/PLAYER-CONNECTOR.md, ADR 0043). The console pushes a
 * `TableSnapshot` to main; main turns it into one `ServerMessage` per device with `viewFor`, so
 * each browser receives only what it may see.
 */

export type Role = 'ally' | 'enemy' | 'neutral';
export type CreatureKind = 'pc' | 'npc';

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
  creature?: { kind: CreatureKind; id: string };
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
  tokens: TableToken[];
}

/** A PC card or NPC flagged player-controllable, with what its owner may see. */
export interface TableCreature {
  kind: CreatureKind;
  id: string;
  name: string;
  portraitSrc?: string;
  /** Offered in the picker now (decision 13); a claimed creature keeps its claim either way. */
  claimable: boolean;
  hp: { current: number; max: number; temp: number } | null;
  ac: number | null;
  conditions: string[];
}

export interface TableSnapshot {
  campaignId: string;
  campaignName: string;
  scene: TableScene | null;
  creatures: TableCreature[];
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
  tokens: ClientToken[];
}

export interface CreatureView {
  kind: CreatureKind;
  id: string;
  name: string;
  portraitUrl?: string;
  hp: { current: number; max: number; temp: number } | null;
  ac: number | null;
  conditions: string[];
  /** Its token on the live map, when the device can see it there. */
  tokenId?: string;
}

export interface PickerEntry {
  kind: CreatureKind;
  id: string;
  name: string;
  portraitUrl?: string;
  /** Claimed by another device. */
  inUse: boolean;
}

export interface ClientView {
  campaignName: string;
  mine: CreatureView[];
  /** Empty while the device holds creatures; the picker is for devices with none. */
  picker: PickerEntry[];
  map: ClientMap | null;
}

export type ServerMessage =
  | ({ type: 'state' } & ClientView)
  /** A new device token, sent once right after a first claim. */
  | { type: 'token'; token: string; campaignId: string }
  | { type: 'error'; message: string }
  /** The DM pressed Stop or closed the campaign. */
  | { type: 'closed' };

export type ClientMessage =
  | { type: 'hello'; token?: string }
  | { type: 'claim'; creatureKind: CreatureKind; creatureId: string; label?: string };
