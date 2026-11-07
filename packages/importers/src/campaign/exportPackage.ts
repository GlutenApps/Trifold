import type {
  Adventure,
  Campaign,
  CampaignExportOptions,
  Encounter,
  Note,
  NPC,
  PCCard,
  RecordRef,
  Scene,
} from '@trifold/schema';

/**
 * Campaign export and import as pure data (ADR 0015). The main process reads the campaign folder
 * into `CampaignParts`, runs these, and zips or writes the result; nothing here touches disk.
 */
export interface CampaignParts {
  campaign: Campaign;
  pcs: PCCard[];
  encounters: Encounter[];
  adventures: Adventure[];
  notes: Note[];
  npcs: NPC[];
  scenes: Scene[];
}

export const DEFAULT_EXPORT_OPTIONS: CampaignExportOptions = {
  state: 'asIs',
  party: true,
  homebrew: true,
  layout: false,
};

/** Bundled sources: they ship with every Trifold, so their records always resolve. */
export function isBundledSource(sourceId: string): boolean {
  return sourceId.startsWith('srd-');
}

export const HOMEBREW_SOURCE = 'homebrew';

/**
 * Resets what play changed and keeps what the DM wrote or built: PC and NPC HP, the dead, fights
 * in progress (with their conditions), results and logs, the active adventure, and dead marks
 * on tokens. Token positions stay.
 */
export function freshStart(parts: CampaignParts): CampaignParts {
  return {
    ...parts,
    campaign: { ...parts.campaign, activeAdventureId: null },
    pcs: parts.pcs.map((pc) => {
      const { currentHp: _hp, tempHp: _temp, ...rest } = pc;
      return rest;
    }),
    npcs: parts.npcs.map((npc) => {
      const { hp: _hp, ...rest } = npc;
      return { ...rest, isAlive: true };
    }),
    encounters: parts.encounters.map((e) => ({ ...e, state: null, results: [] })),
    scenes: parts.scenes.map((s) => ({
      ...s,
      tokens: s.tokens.map((t) => ({ ...t, dead: false })),
    })),
  };
}

/**
 * What goes into the file: fresh start when asked, the party only when asked, and never the
 * scene music, which points at this Library's music.
 */
export function prepareExport(parts: CampaignParts, options: CampaignExportOptions): CampaignParts {
  const base = options.state === 'fresh' ? freshStart(parts) : parts;
  return {
    ...base,
    pcs: options.party ? base.pcs : [],
    scenes: base.scenes.map((s) => {
      const { audio: _audio, ...rest } = s;
      return rest;
    }),
  };
}

/**
 * Every compendium record the campaign points at, wherever it sits (NPC stat blocks, encounter
 * templates, combatants in a saved fight, tokens), found by shape so a new place is never missed.
 */
export function recordRefsIn(value: unknown): RecordRef[] {
  const found = new Map<string, RecordRef>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (
      typeof o['recordId'] === 'string' &&
      typeof o['sourceId'] === 'string' &&
      typeof o['key'] === 'string'
    ) {
      const ref = o as unknown as RecordRef;
      found.set(`${ref.sourceId}\u0000${ref.recordId}`, ref);
    }
    for (const child of Object.values(o)) walk(child);
  };
  walk(value);
  return [...found.values()];
}

/** The records an export cannot carry: from sources the DM imported (never bundled, ADR 0015). */
export function importedSourceRefs(parts: CampaignParts): RecordRef[] {
  return recordRefsIn(parts).filter(
    (r) => r.sourceId !== HOMEBREW_SOURCE && !isBundledSource(r.sourceId),
  );
}

export function homebrewIdsIn(parts: CampaignParts): string[] {
  return recordRefsIn(parts)
    .filter((r) => r.sourceId === HOMEBREW_SOURCE)
    .map((r) => r.recordId);
}

/**
 * Campaign-relative files only the left-out PCs used (portraits), so a party-off export does not
 * carry the players' pictures. A file anything kept still names is kept.
 */
export function filesOnlyLeftOutPcsUse(all: CampaignParts, kept: CampaignParts): string[] {
  const keptText = JSON.stringify(kept);
  return all.pcs
    .filter((pc) => !kept.pcs.some((k) => k.id === pc.id))
    .map((pc) => pc.portrait)
    .filter((p): p is string => !!p && !keptText.includes(JSON.stringify(p)));
}

/**
 * For Import as a copy: a new id for the campaign and every object in it, replaced wherever the
 * old one appears (links, tokens, fights, adventures), so the copy never points at the original.
 */
export function withNewIds(parts: CampaignParts, newId: () => string): CampaignParts {
  const ids = new Map<string, string>();
  const claim = (id: string) => {
    if (!ids.has(id)) ids.set(id, newId());
  };
  claim(parts.campaign.id);
  for (const group of [
    parts.pcs,
    parts.encounters,
    parts.adventures,
    parts.notes,
    parts.npcs,
    parts.scenes,
  ]) {
    for (const item of group) claim(item.id);
  }
  const swap = (v: unknown): unknown => {
    if (typeof v === 'string') return ids.get(v) ?? v;
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, child]) => [k, swap(child)]));
    }
    return v;
  };
  return swap(parts) as CampaignParts;
}
