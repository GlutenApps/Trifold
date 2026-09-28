import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { ulid } from 'ulid';
import type { CampaignImportReport } from '@trifold/api';
import {
  IMPORTER_VERSION,
  parseCampaignXml,
  type ImportedCombatant,
  type ImportedEncounter,
  type ImportedPc,
} from '@trifold/importers';
import { normalizeKey } from '@trifold/rules';
import {
  CAMPAIGN_SCHEMA_VERSION,
  nowIso,
  type CombatantTemplate,
  type CompendiumRecord,
  type Encounter,
  type MonsterRecord,
  type NPC,
  type PCCard,
  type Source,
} from '@trifold/schema';
import type { IndexDb } from '../index/IndexDb';
import type { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';
import type { SourceRepository } from '../sources/repository';
import { CampaignEntities } from './entities';
import type { CampaignRepository } from './repository';

export interface CampaignImportContext {
  store: LibraryStore;
  sources: SourceRepository;
  index: IndexDb;
  campaigns: CampaignRepository;
  logger: Logger;
}

function pcFromImport(q: ImportedPc, existing?: PCCard): PCCard {
  const now = nowIso();
  return {
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    id: existing?.id ?? ulid(),
    name: q.name,
    playerName: q.playerName ?? existing?.playerName ?? '',
    classText: q.classText ?? existing?.classText ?? '',
    level: q.level ?? existing?.level ?? 1,
    maxHp: q.maxHp ?? existing?.maxHp ?? 10,
    ac: q.ac ?? existing?.ac ?? 10,
    initiativeBonus: q.initiativeBonus ?? existing?.initiativeBonus ?? 0,
    speed: q.speed ?? existing?.speed ?? 30,
    passives: {
      perception: q.passivePerception ?? existing?.passives.perception ?? 10,
      insight: existing?.passives.insight ?? 10,
      investigation: existing?.passives.investigation ?? 10,
    },
    ...(q.spellSaveDc !== undefined
      ? { spellSaveDc: q.spellSaveDc }
      : existing?.spellSaveDc !== undefined
        ? { spellSaveDc: existing.spellSaveDc }
        : {}),
    saves: Object.keys(q.saves).length ? q.saves : (existing?.saves ?? {}),
    notes: q.notes || existing?.notes || '',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function recordTemplate(
  record: MonsterRecord,
  c: Pick<ImportedCombatant, 'quantity' | 'role' | 'hidden' | 'label' | 'maxHp'>,
): CombatantTemplate {
  return {
    id: ulid(),
    ref: {
      kind: 'record',
      ref: {
        recordId: record.id,
        sourceId: record.sourceId,
        key: record.key,
        edition: record.edition,
      },
      name: record.displayName,
    },
    quantity: c.quantity,
    role: c.role,
    hidden: c.hidden,
    ...(c.label ? { label: c.label } : {}),
    ...(c.maxHp !== undefined && c.maxHp !== (record.data.hp?.average ?? c.maxHp)
      ? { hpOverride: c.maxHp }
      : {}),
    cache: {
      xp: record.data.xp,
      cr: record.data.cr,
      type: record.data.type,
      hp: record.data.hp?.average ?? 0,
      ac: record.data.ac?.value ?? 10,
    },
  };
}

/**
 * Imports a Game Master campaign XML (or a Fight Club GM export) into a new campaign, or merges
 * its PCs, NPCs, notes and encounters into the open one. Inline stat blocks become a source of
 * their own so encounters and NPCs can reference them like any other record.
 */
export async function importCampaignXml(
  ctx: CampaignImportContext,
  filePath: string,
  mode: 'new' | 'merge',
): Promise<CampaignImportReport> {
  const xml = await readFile(filePath, 'utf8');
  const fileName = basename(filePath, extname(filePath));
  const statBlockSourceId = ulid();
  const parsed = parseCampaignXml(xml, {
    statBlockSourceId,
    defaultEdition: '2014',
    edition2024Books: ctx.store.getSettings().edition2024Books,
  });
  const root = (parsed.rootElement ?? '').toLowerCase();
  if (parsed.rootElement && root !== 'campaign' && root !== 'data') {
    throw new Error(`This file is not a campaign XML (root element <${parsed.rootElement}>).`);
  }
  const warnings = [...parsed.warnings];
  const name = parsed.name ?? fileName;

  if (mode === 'new') await ctx.campaigns.create(name);
  else if (!ctx.campaigns.current) {
    throw new Error('Open a campaign first, or import as a new campaign');
  }
  const bundle = await ctx.campaigns.bundle();
  const entities = new CampaignEntities(ctx.campaigns);

  // Inline stat blocks and nested spells → their own source, indexed immediately.
  if (parsed.statBlocks.length > 0) {
    const counts: Partial<Record<CompendiumRecord['kind'], number>> = {};
    for (const r of parsed.statBlocks) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    const source: Source = {
      schemaVersion: 1,
      id: statBlockSourceId,
      name: `${name} (campaign file)`,
      kind: 'xml',
      enabled: true,
      defaultEdition: '2014',
      edition2024Books: [],
      license: { nonSrd: true, attribution: null },
      importedAt: nowIso(),
      importerVersion: IMPORTER_VERSION,
      recordCounts: counts,
      warnings: [],
    };
    await ctx.sources.writeRecords(statBlockSourceId, parsed.statBlocks);
    await ctx.sources.write(source);
    ctx.index.replaceSource(source, parsed.statBlocks);
  }

  const findRecord = async (nameOrKey: string): Promise<MonsterRecord | null> => {
    const matches = ctx.index.findByKey('monster', normalizeKey(nameOrKey));
    const preferred = bundle.campaign.preferredEdition;
    const pick =
      matches.find((m) => m.sourceId === statBlockSourceId) ??
      matches.find((m) => m.edition === preferred) ??
      matches[0];
    return pick && pick.kind === 'monster' ? pick : null;
  };

  // PCs: merge by name; remember uids for encounter references.
  const pcsByKey = new Map(bundle.pcs.map((p) => [normalizeKey(p.name), p]));
  const pcsByUid = new Map<string, PCCard>();
  for (const q of parsed.pcs) {
    const saved = await ctx.campaigns.savePc(pcFromImport(q, pcsByKey.get(normalizeKey(q.name))));
    pcsByKey.set(normalizeKey(saved.name), saved);
    if (q.uid) pcsByUid.set(q.uid, saved);
  }

  // NPCs, with stat block links.
  const npcsByKey = new Map(bundle.npcs.map((n) => [normalizeKey(n.name), n]));
  const npcsByUid = new Map<string, { npc: NPC; isEnemy: boolean }>();
  for (const n of parsed.npcs) {
    const record = n.statBlockKey ? await findRecord(n.statBlockKey) : await findRecord(n.name);
    const saved = await entities.saveNpc({
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: '',
      name: n.name,
      role: n.role,
      location: n.location,
      notes: n.notes,
      isAlive: n.isAlive,
      ...(record
        ? {
            recordRef: {
              recordId: record.id,
              sourceId: record.sourceId,
              key: record.key,
              edition: record.edition,
            },
          }
        : {}),
      createdAt: '',
      updatedAt: '',
    });
    npcsByKey.set(normalizeKey(saved.name), saved);
    if (n.uid) npcsByUid.set(n.uid, { npc: saved, isEnemy: n.isEnemy });
  }

  const unresolved: string[] = [];
  const templateFor = async (c: ImportedCombatant): Promise<CombatantTemplate> => {
    const base = {
      quantity: c.quantity,
      role: c.role,
      hidden: c.hidden,
      label: c.label,
      maxHp: c.maxHp,
    };
    // Game Master uid references to PCs and NPCs.
    if (c.uid) {
      const pc = pcsByUid.get(c.uid);
      if (pc) {
        return {
          id: ulid(),
          ref: { kind: 'pc', pcId: pc.id, name: pc.name },
          quantity: 1,
          role: 'ally',
          hidden: c.hidden,
        };
      }
      const hit = npcsByUid.get(c.uid);
      if (hit) {
        const role = hit.isEnemy ? 'enemy' : 'ally';
        if (hit.npc.recordRef) {
          const record = await findRecord(hit.npc.recordRef.key);
          if (record) {
            const label = hit.npc.name !== record.displayName ? hit.npc.name : c.label;
            return recordTemplate(record, { ...base, role, ...(label ? { label } : {}) });
          }
        }
        return {
          id: ulid(),
          ref: { kind: 'npc', npcId: hit.npc.id, name: hit.npc.name },
          quantity: 1,
          role,
          hidden: c.hidden,
        };
      }
      unresolved.push(c.name);
    }
    // Named entries: PC card, NPC, then any monster record.
    const pc = pcsByKey.get(normalizeKey(c.name));
    if (c.isPc || pc) {
      if (pc) {
        return {
          id: ulid(),
          ref: { kind: 'pc', pcId: pc.id, name: pc.name },
          quantity: 1,
          role: 'ally',
          hidden: c.hidden,
          ...(c.label ? { label: c.label } : {}),
        };
      }
      unresolved.push(c.name);
    }
    const npc = npcsByKey.get(normalizeKey(c.name));
    if (npc && !npc.recordRef) {
      return {
        id: ulid(),
        ref: { kind: 'npc', npcId: npc.id, name: npc.name },
        quantity: 1,
        role: c.role,
        hidden: c.hidden,
        ...(c.label ? { label: c.label } : {}),
        ...(c.maxHp !== undefined ? { hpOverride: c.maxHp } : {}),
      };
    }
    const record = await findRecord(c.statBlockKey ?? npc?.recordRef?.key ?? c.name);
    if (record) return recordTemplate(record, base);
    if (!c.isPc && !c.uid) unresolved.push(c.name);
    return {
      id: ulid(),
      ref: { kind: 'custom', name: c.name },
      quantity: c.quantity,
      role: c.role,
      hidden: c.hidden,
      ...(c.label ? { label: c.label } : {}),
      ...(c.maxHp !== undefined ? { hpOverride: c.maxHp } : {}),
      cache: { xp: 0, cr: '', type: '', hp: c.maxHp ?? c.hp ?? 0, ac: 10 },
    };
  };

  const saveEncounter = async (e: ImportedEncounter): Promise<Encounter> => {
    const combatants: CombatantTemplate[] = [];
    for (const c of e.combatants) combatants.push(await templateFor(c));
    return ctx.campaigns.saveEncounter({
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: '',
      name: e.name,
      combatants,
      notes: e.notes,
      state: null,
      results: [],
      createdAt: '',
      updatedAt: '',
    });
  };

  const saveNote = (title: string, body: string) =>
    entities.saveNote({
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: '',
      title,
      body,
      tags: [],
      links: [],
      createdAt: '',
      updatedAt: '',
    });

  let noteCount = 0;
  let encounterCount = 0;
  for (const n of parsed.notes) {
    await saveNote(n.title, n.body);
    noteCount += 1;
  }
  for (const e of parsed.encounters) {
    await saveEncounter(e);
    encounterCount += 1;
  }
  let order = bundle.adventures.length;
  for (const a of parsed.adventures) {
    const noteIds: string[] = [];
    for (const n of a.notes) {
      noteIds.push((await saveNote(n.title, n.body)).id);
      noteCount += 1;
    }
    const encounterIds: string[] = [];
    for (const e of a.encounters) {
      encounterIds.push((await saveEncounter(e)).id);
      encounterCount += 1;
    }
    await entities.saveAdventure({
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: '',
      name: a.name,
      summary: a.summary,
      sceneIds: [],
      encounterIds,
      noteIds,
      order: order++,
      createdAt: '',
      updatedAt: '',
    });
  }
  if (parsed.items.length > 0) {
    await saveNote(
      'Items from import',
      parsed.items
        .map(
          (i) =>
            `- ${i.quantity > 1 ? `${i.quantity} × ` : ''}${i.name}${i.text ? `\n  ${i.text.replace(/\n/g, '\n  ')}` : ''}`,
        )
        .join('\n'),
    );
    noteCount += 1;
  }

  const unique = [...new Set(unresolved)];
  if (unique.length > 0) {
    warnings.push(`Combatants without a matching record or PC card: ${unique.join(', ')}`);
  }
  ctx.logger.info(
    `campaign "${name}" ${mode === 'new' ? 'imported' : 'merged'}: ${parsed.pcs.length} PCs, ${parsed.npcs.length} NPCs, ${noteCount} notes, ${parsed.adventures.length} adventures, ${encounterCount} encounters, ${parsed.statBlocks.length} inline records`,
  );
  return {
    campaignId: bundle.campaign.id,
    name,
    mode,
    counts: {
      pcs: parsed.pcs.length,
      npcs: parsed.npcs.length,
      notes: noteCount,
      adventures: parsed.adventures.length,
      encounters: encounterCount,
      statBlocks: parsed.statBlocks.length,
    },
    unresolved: unique,
    warnings,
  };
}
