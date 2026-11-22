import { describe, expect, it } from 'vitest';
import type { CompendiumRecord, RecordKind, Source } from '@trifold/schema';
import { loadShared, NOTHING_SHARED, selectShared, sharedSourceId } from './sharedContent';

const rec = (
  id: string,
  kind: RecordKind,
  sourceId: string,
  extra: Partial<CompendiumRecord> = {},
): CompendiumRecord =>
  ({
    schemaVersion: 1,
    id,
    kind,
    key: id,
    name: id,
    displayName: id,
    sourceId,
    edition: '2024',
    tags: [],
    data: {},
    ...extra,
  }) as CompendiumRecord;

const source = (id: string, extra: Partial<Source> = {}): Source =>
  ({
    schemaVersion: 1,
    id,
    name: `Book ${id}`,
    kind: 'xml',
    enabled: true,
    campaignIds: null,
    license: { attribution: null, nonSrd: true },
    ...extra,
  }) as Source;

describe('selectShared', () => {
  it('shares a ticked source’s player-facing records and never its creatures', () => {
    const out = selectShared({
      campaignId: 'C1',
      sources: [
        {
          source: source('S1'),
          records: [
            rec('S1:spell:ward', 'spell', 'S1'),
            rec('S1:item:lantern', 'item', 'S1'),
            rec('S1:monster:lurker', 'monster', 'S1'),
          ],
        },
      ],
      homebrew: [],
      creatures: [],
    });
    expect(out.records.map((r) => r.id)).toEqual([
      'shared:C1:S1:item:lantern',
      'shared:C1:S1:spell:ward',
    ]);
    // Each is filed under the joined campaign's own source, and says where it came from.
    expect(out.records[0]).toMatchObject({
      sourceId: sharedSourceId('C1'),
      sharedFrom: { sourceName: 'Book S1', nonSrd: true },
    });
    expect(out.hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('shares homebrew record by record, creatures only as companions, and never the SRD', () => {
    const out = selectShared({
      campaignId: 'C1',
      sources: [],
      homebrew: [
        rec('hb-blade', 'item', 'homebrew', {
          basedOn: { recordId: 'S1:item:blade', sourceId: 'S1' },
        }),
        rec('hb-feat', 'feat', 'homebrew', {
          basedOn: { recordId: 'srd-2024:feat:alert', sourceId: 'srd-2024' },
        }),
        rec('hb-horror', 'monster', 'homebrew'),
      ],
      creatures: [
        { record: rec('hb-wolf', 'monster', 'homebrew'), sourceName: 'Homebrew', nonSrd: false },
        {
          record: rec('srd-2024:monster:wolf', 'monster', 'srd-2024'),
          sourceName: 'SRD',
          nonSrd: false,
        },
        // Only a stat block crosses as a creature.
        { record: rec('S1:spell:x', 'spell', 'S1'), sourceName: 'Book S1', nonSrd: true },
      ],
    });
    expect(out.records.map((r) => [r.id, r.sharedFrom?.nonSrd])).toEqual([
      ['shared:C1:hb-blade', true],
      ['shared:C1:hb-feat', false],
      ['shared:C1:hb-wolf', false],
    ]);
    // The link back to the GM's own record does not travel.
    expect(out.records.every((r) => r.basedOn === undefined)).toBe(true);
  });

  it('gives the same hash for the same content, a new one when it changes, and none for nothing', () => {
    const one = { source: source('S1'), records: [rec('S1:spell:ward', 'spell', 'S1')] };
    const base = { campaignId: 'C1', homebrew: [], creatures: [] };
    const a = selectShared({ ...base, sources: [one] });
    expect(selectShared({ ...base, sources: [one] }).hash).toBe(a.hash);
    const changed = {
      source: source('S1'),
      records: [rec('S1:spell:ward', 'spell', 'S1', { name: 'Warding' })],
    };
    expect(selectShared({ ...base, sources: [changed] }).hash).not.toBe(a.hash);
    expect(selectShared({ ...base, sources: [] })).toBe(NOTHING_SHARED);
  });
});

describe('loadShared', () => {
  const records: Record<string, CompendiumRecord[]> = {
    S1: [rec('S1:spell:ward', 'spell', 'S1'), rec('S1:monster:lurker', 'monster', 'S1')],
    S2: [rec('S2:feat:bold', 'feat', 'S2')],
    S3: [rec('S3:feat:sly', 'feat', 'S3')],
  };
  const all = [
    source('S1'),
    source('S2', { enabled: false }),
    // Limited to another campaign: this one does not see it, so it cannot share it.
    source('S3', { campaignIds: ['OTHER'] }),
    source('srd-2024', { kind: 'srd' }),
  ];
  const stock = new Map(
    [rec('S1:monster:lurker', 'monster', 'S1'), rec('hb-wolf', 'monster', 'homebrew')].map((r) => [
      r.id,
      r,
    ]),
  );
  const from = {
    catalog: {
      list: async () => all,
      readAllRecords: async (id: string) => records[id] ?? [],
    },
    index: {
      get: (id: string) => stock.get(id) ?? null,
      // Books by key, as the index answers: S2 holds the feat "bold" in the book "tome two".
      recordsOfBooks: (keys: readonly string[]) =>
        keys.includes('tome two') ? [rec('S2:feat:bold', 'feat', 'S2')] : [],
    },
    homebrew: {
      list: async () => [rec('hb-blade', 'item', 'homebrew'), rec('hb-secret', 'item', 'homebrew')],
    },
  };
  const view = { id: 'C1', sourceId: 'campaign:c1' };
  const campaign = (shared: object, summonable: string[] = []) =>
    ({
      id: 'C1',
      settings: {
        shared: { sourceIds: [], homebrewIds: [], ...shared },
        summonable: summonable.map((recordId) => ({ ref: { recordId } })),
      },
    }) as never;

  it('shares nothing until the GM turns something on', async () => {
    expect(await loadShared(from, campaign({}), view, [], new Set())).toBe(NOTHING_SHARED);
  });

  it('reads only what was ticked, from sources this campaign sees', async () => {
    const out = await loadShared(
      from,
      campaign({ sourceIds: ['S1', 'S2', 'S3', 'srd-2024', 'gone'], homebrewIds: ['hb-blade'] }),
      view,
      [],
      new Set(),
    );
    expect(out.records.map((r) => r.id)).toEqual(['shared:C1:S1:spell:ward', 'shared:C1:hb-blade']);
  });

  it('shares a collection’s books from the files this campaign sees (ADR 0062)', async () => {
    const collections = [
      { id: 'K1', name: 'Table books', bookKeys: ['tome two'], campaignIds: [] },
      { id: 'K2', name: 'Other', bookKeys: ['nothing here'], campaignIds: [] },
    ];
    const out = await loadShared(
      from,
      campaign({ collectionIds: ['K1', 'gone'] }),
      view,
      [],
      new Set(),
      collections,
    );
    // S2 is switched off in the Library, so its book is not shared even through a collection.
    expect(out.records).toEqual([]);
    const on = {
      ...from,
      catalog: { ...from.catalog, list: async () => all.map((s) => ({ ...s, enabled: true })) },
    };
    const shared = await loadShared(
      on,
      campaign({ collectionIds: ['K1'] }),
      view,
      [],
      new Set(),
      collections,
    );
    expect(shared.records.map((r) => [r.id, r.sharedFrom?.sourceName])).toEqual([
      ['shared:C1:S2:feat:bold', 'Book S2'],
    ]);
  });

  it('shares the stat blocks of the companion list, of NPC companions and of held NPCs', async () => {
    const npcs = [
      { id: 'N1', companionOf: 'PC1', recordRef: { recordId: 'hb-wolf' } },
      { id: 'N2', recordRef: { recordId: 'S1:monster:lurker' } },
      { id: 'N3' },
    ] as never;
    // Nobody holds N2: its stat block stays with the GM.
    const quiet = await loadShared(from, campaign({}), view, npcs, new Set());
    expect(quiet.records.map((r) => r.id)).toEqual(['shared:C1:hb-wolf']);
    const held = await loadShared(from, campaign({}), view, npcs, new Set(['N2']));
    expect(held.records.map((r) => r.id)).toEqual([
      'shared:C1:S1:monster:lurker',
      'shared:C1:hb-wolf',
    ]);
    expect(held.records[0]!.sharedFrom).toEqual({ sourceName: 'Book S1', nonSrd: true });
    const listed = await loadShared(from, campaign({}, ['S1:monster:lurker']), view, [], new Set());
    expect(listed.records.map((r) => r.id)).toEqual(['shared:C1:S1:monster:lurker']);
  });
});
