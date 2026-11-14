import { ulid } from 'ulid';
import { RECORD_SCHEMA_VERSION, type CompendiumRecord, type RecordKind } from '@trifold/schema';

/**
 * Homebrew from scratch (DESIGN.md §6.2, ADR 0026): a blank record of each kind, valid against
 * the schema, placed in the `homebrew` source. Nothing is written until the DM saves it in the
 * editor, which gives it its name and key.
 */
export const HOMEBREW_SOURCE_ID = 'homebrew';
export const HOMEBREW_BOOK = 'Trifold Homebrew';

/** A campaign's own creatures (ADR 0035) have a source id of this form. */
export const isCampaignSource = (sourceId: string) => sourceId.startsWith('campaign:');

/**
 * The DM's own records, which can be edited and deleted: the Library's homebrew and the open
 * campaign's creatures (ADR 0035). Records from the SRD or an imported file never change.
 */
export const isOwnRecord = (record: Pick<CompendiumRecord, 'sourceId'>) =>
  record.sourceId === HOMEBREW_SOURCE_ID || isCampaignSource(record.sourceId);

/** The kinds as the DM reads them, singular, for "New monster" and the editors' titles. */
export const KIND_NAMES: Record<RecordKind, string> = {
  monster: 'monster',
  spell: 'spell',
  item: 'item',
  feat: 'feat',
  species: 'species',
  background: 'background',
  class: 'class',
  condition: 'condition',
};

export function blankRecord(kind: RecordKind): CompendiumRecord {
  const header = {
    schemaVersion: RECORD_SCHEMA_VERSION as typeof RECORD_SCHEMA_VERSION,
    id: `${HOMEBREW_SOURCE_ID}:${kind}:${ulid()}`,
    key: '',
    name: '',
    displayName: '',
    sourceId: HOMEBREW_SOURCE_ID,
    sourceBook: HOMEBREW_BOOK,
    edition: '2024' as const,
    tags: [],
  };
  const extra = {};
  switch (kind) {
    case 'monster':
      return {
        ...header,
        kind,
        data: {
          size: 'M',
          type: '',
          alignment: '',
          ac: { value: 10 },
          hp: { average: 1 },
          speeds: { walk: 30, notes: [], raw: '30 ft.' },
          abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
          saves: {},
          skills: {},
          proficiencyBonus: 2,
          senses: '',
          passivePerception: 10,
          languages: '',
          cr: '0',
          xp: 10,
          damageVulnerabilities: [],
          damageResistances: [],
          damageImmunities: [],
          conditionImmunities: [],
          environment: [],
          isNpc: false,
          traits: [],
          actions: [],
          bonusActions: [],
          reactions: [],
          legendary: { actions: [] },
          lair: [],
          extra,
        },
      };
    case 'spell':
      return {
        ...header,
        kind,
        data: {
          level: 1,
          school: '',
          ritual: false,
          time: '1 action',
          range: '',
          components: '',
          duration: 'Instantaneous',
          classes: [],
          text: '',
          rolls: [],
          modifiers: [],
          extra,
        },
      };
    case 'item':
      return {
        ...header,
        kind,
        data: {
          typeCode: 'W',
          magic: true,
          stealthDisadvantage: false,
          properties: [],
          text: '',
          rolls: [],
          modifiers: [],
          contents: [],
          extra,
        },
      };
    case 'feat':
      return { ...header, kind, data: { text: '', rolls: [], modifiers: [], extra } };
    case 'condition':
      return { ...header, kind, data: { text: '', extra } };
    case 'species':
      return { ...header, kind, data: { spells: [], traits: [], extra } };
    case 'background':
      return { ...header, kind, data: { traits: [], modifiers: [], extra } };
    case 'class':
      return { ...header, kind, data: { levels: [], extra } };
  }
}
