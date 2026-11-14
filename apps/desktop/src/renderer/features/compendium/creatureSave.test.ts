import { describe, expect, it } from 'vitest';
import type { CombatantTemplate, CompendiumRecord, Encounter, Scene } from '@trifold/schema';
import {
  freeName,
  goesToLibrary,
  homeChoices,
  rehome,
  scopeChoices,
  type CampaignView,
} from './creatureSave';

const goblinRef = {
  kind: 'record',
  ref: { recordId: 'srd:goblin', sourceId: 'srd', key: 'goblin', edition: '2024' },
  name: 'Goblin',
} as const;
const original = { identity: { id: 'srd:goblin', sourceId: 'srd', key: 'goblin' }, name: 'Goblin' };

const row = (id: string, quantity = 1, tokenIds?: string[]): CombatantTemplate => ({
  id,
  ref: goblinRef,
  quantity,
  role: 'enemy',
  hidden: false,
  ...(tokenIds ? { tokenIds } : {}),
});
const enc = (id: string, combatants: CombatantTemplate[]) =>
  ({ id, name: id, combatants, state: null }) as unknown as Encounter;
const scene = (tokens: string[]) =>
  ({
    id: 's',
    tokens: tokens.map((id) => ({ id, kind: 'creature', ref: goblinRef })),
  }) as unknown as Scene;

const campaign = (encounters: Encounter[], scenes: Scene[] = []): CampaignView => ({
  slug: 'greyford',
  name: 'Greyford',
  encounters,
  scenes,
});

const record = {
  id: 'homebrew:monster:x',
  kind: 'monster',
  key: 'grik',
  displayName: 'Grik',
  name: 'Grik',
  sourceId: 'homebrew',
  sourceBook: 'Trifold Homebrew',
} as unknown as CompendiumRecord;

describe('homeChoices', () => {
  it('offers this campaign first when one is open, else only the compendium', () => {
    expect(homeChoices(false, campaign([])).map((c) => c.label)).toEqual([
      'This campaign only',
      'All campaigns',
    ]);
    expect(homeChoices(false, null).map((c) => c.id)).toEqual(['library']);
  });

  it('offers Update or Save as new for the DM’s own record', () => {
    expect(homeChoices(true, campaign([])).map((c) => c.id)).toEqual(['update', 'new']);
  });
});

describe('rehome', () => {
  it('moves a copy into the campaign or the compendium, with that home’s id and source', () => {
    const inCampaign = rehome(record, 'campaign', { slug: 'greyford', name: 'Greyford' });
    expect(inCampaign).toMatchObject({ sourceId: 'campaign:greyford', sourceBook: 'Greyford' });
    expect(inCampaign.id).toMatch(/^creature:monster:/);
    const inLibrary = rehome({ ...record, sourceId: 'campaign:greyford' }, 'library', null);
    expect(inLibrary).toMatchObject({ sourceId: 'homebrew', sourceBook: 'Trifold Homebrew' });
    expect(inLibrary.id).toMatch(/^homebrew:monster:/);
  });

  it('updates in place, and saves as new where the record lives, based on it', () => {
    expect(rehome(record, 'update', null)).toBe(record);
    const again = rehome({ ...record, sourceId: 'campaign:greyford' }, 'new', {
      slug: 'greyford',
      name: 'Greyford',
    });
    expect(again.sourceId).toBe('campaign:greyford');
    expect(again.id).not.toBe(record.id);
    expect(again.basedOn).toEqual({ recordId: record.id, sourceId: 'campaign:greyford' });
  });
});

describe('goesToLibrary and freeName', () => {
  it('knows which saves are listed in the Library, where names must differ', () => {
    expect(goesToLibrary(record, 'library')).toBe(true);
    expect(goesToLibrary(record, 'update')).toBe(true);
    expect(goesToLibrary(record, 'campaign')).toBe(false);
    expect(goesToLibrary({ ...record, sourceId: 'campaign:greyford' }, 'update')).toBe(false);
  });

  it('suggests the lowest free number, never brackets', () => {
    const taken = new Set(['goblin', 'goblin 2']);
    expect(freeName('Goblin', (k) => taken.has(k))).toBe('Goblin 3');
  });
});

describe('scopeChoices', () => {
  it('from a record page: Nowhere yet, then the campaign only when it uses the original', () => {
    expect(scopeChoices({ kind: 'record' }, 'library', original, campaign([]), null)).toEqual([
      { id: 'none', label: 'Nowhere yet' },
    ]);
    const used = scopeChoices(
      { kind: 'record' },
      'library',
      original,
      campaign([enc('A', [row('r')])]),
      null,
    );
    expect(used.map((c) => c.id)).toEqual(['none', 'campaign']);
    expect(used[1]).toMatchObject({
      label: 'Every Goblin in this campaign',
      detail: '1 encounter',
    });
  });

  it('from a row: this row, the encounter when another row uses it, the campaign when elsewhere does', () => {
    const origin = { kind: 'row', encounterId: 'A', templateId: 'r1' } as const;
    const alone = scopeChoices(
      origin,
      'campaign',
      original,
      campaign([enc('A', [row('r1', 3)])]),
      null,
    );
    expect(alone).toEqual([{ id: 'row', label: 'This row', detail: '3 of them' }]);

    const busy = scopeChoices(
      origin,
      'campaign',
      original,
      campaign(
        [enc('A', [row('r1', 1, ['own']), row('r2')]), enc('B', [row('r3')])],
        [scene(['own', 'x'])],
      ),
      null,
    );
    expect(busy.map((c) => [c.id, c.detail])).toEqual([
      ['row', undefined],
      ['encounter', '2 rows'],
      ['campaign', 'Also 1 encounter and 1 token'],
    ]);
  });

  it('from a fighter: just it, the fight when others use it', () => {
    const origin = {
      kind: 'fighter',
      encounterId: 'A',
      templateId: 'r1',
      combatantId: 'c2',
      fighterName: 'Goblin 2',
    } as const;
    const choices = scopeChoices(
      origin,
      'campaign',
      original,
      campaign([enc('A', [row('r1', 3)])]),
      null,
    );
    expect(choices.map((c) => c.label)).toEqual(['Just Goblin 2', 'Every Goblin in this fight']);
    expect(choices[0]!.detail).toBe('It leaves its group as a row of its own.');
  });

  it('offers nothing for an update in place or a blank record', () => {
    expect(scopeChoices({ kind: 'record' }, 'update', original, campaign([]), null)).toEqual([]);
    expect(scopeChoices({ kind: 'record' }, 'library', null, campaign([]), null)).toEqual([]);
  });
});
