import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCompendiumXml } from '@trifold/importers';
import { describe, expect, it } from 'vitest';
import {
  buildFtsMatch,
  buildSearch,
  buildPhraseMatch,
  buildSuggest,
  buildTextSearch,
  indexText,
  likeEscape,
  parseEditions,
  parseVersions,
  recordColumns,
  splitSnippet,
} from './query';

const FIXTURE = join(__dirname, '..', '..', '..', '..', '..', 'fixtures', 'compendium-sample.xml');
const { records } = parseCompendiumXml(readFileSync(FIXTURE, 'utf8'), {
  sourceId: 'src',
  defaultEdition: '2014',
});

describe('recordColumns', () => {
  it('fills monster columns', () => {
    const goblin = records.find((r) => r.name === 'Goblin Warrior [5.5e]');
    expect(goblin && recordColumns(goblin)).toMatchObject({
      kind: 'monster',
      display_name: 'Goblin Warrior',
      edition: '2024',
      cr: '1/4',
      cr_num: 0.25,
      type: 'fey',
      size: 'S',
      environment: 'forest, grassland, underdark',
      is_npc: 0,
    });
  });

  it('fills spell and item columns', () => {
    const fireball = records.find((r) => r.name === 'Fireball');
    expect(fireball && recordColumns(fireball)).toMatchObject({ level: 3, type: 'EV' });
    const ring = records.find((r) => r.name === 'Ring of Protection');
    expect(ring && recordColumns(ring)).toMatchObject({ type_code: 'RG', rarity: 'rare' });
  });
});

describe('indexText', () => {
  it('includes names, description and feature text', () => {
    const aboleth = records.find((r) => r.name === 'Aboleth');
    const text = aboleth ? indexText(aboleth) : '';
    expect(text).toContain('Aboleth');
    expect(text).toContain('Mucous Cloud');
    expect(text).toContain('amphibious tyrants');
    expect(text).toContain('underdark');
  });
});

describe('buildFtsMatch', () => {
  it('quotes each term as a prefix', () => {
    expect(buildFtsMatch('young red')).toBe('"young"* "red"*');
    expect(buildFtsMatch('  ')).toBeNull();
    expect(buildFtsMatch('say "hi"')).toBe('"say"* """hi"""*');
  });
});

describe('buildSearch', () => {
  it('builds a plain listing without text', () => {
    const q = buildSearch({ kind: 'monster' });
    expect(q.sql).toContain('r.kind = ?');
    expect(q.sql).toContain('s.enabled = 1');
    expect(q.sql).not.toContain('records_fts');
    expect(q.sql).toContain('ORDER BY display_name COLLATE NOCASE');
    expect(q.params).toEqual(['2024', 'monster', '', 200, 0]);
    expect(q.countParams).toEqual(['monster', '']);
  });

  it('collapses records sharing a key to one row headed by the top source, then the preferred edition', () => {
    const q = buildSearch({ kind: 'monster', preferEdition: '2014' });
    expect(q.sql).toContain('s.priority AS source_priority');
    expect(q.sql).toContain('PARTITION BY group_key ORDER BY source_priority, (edition = ?) DESC');
    expect(q.sql).toContain('AS versions');
    expect(q.sql).toContain('GROUP_CONCAT(edition) OVER (PARTITION BY group_key) AS editions');
    expect(q.sql).toContain('WHERE rn = 1');
    expect(q.countSql).toContain("COUNT(DISTINCT CASE WHEN s.kind = 'campaign'");
    expect(q.params[0]).toBe('2014');
  });

  it('lists every record when collapsing is off, for pickers that need one exact record', () => {
    const q = buildSearch({ kind: 'monster', text: 'mage', collapse: false });
    expect(q.sql).not.toContain('ROW_NUMBER');
    expect(q.sql).toContain('ORDER BY rank, r.display_name COLLATE NOCASE');
    expect(q.countSql).toContain('COUNT(*)');
    expect(q.params).toEqual(['monster', '"mage"*', '', 200, 0]);
  });

  it('adds the FTS join and every filter', () => {
    const q = buildSearch({
      kind: 'monster',
      text: 'gob',
      sourceIds: ['a', 'b'],
      edition: '2024',
      crMin: 0.25,
      crMax: 5,
      type: 'Fey',
      size: 'S',
      environment: 'Forest',
      npc: 'exclude',
      limit: 50,
      offset: 100,
    });
    expect(q.sql).toContain('JOIN records_fts f ON f.id = r.id');
    expect(q.sql).toContain('records_fts MATCH ?');
    expect(q.sql).toContain('r.source_id IN (?, ?)');
    expect(q.sql).toContain('bm25(records_fts) AS rank');
    expect(q.sql).toContain('ORDER BY rank, display_name COLLATE NOCASE');
    expect(q.params).toEqual([
      '2024',
      'monster',
      '"gob"*',
      '',
      'a',
      'b',
      '2024',
      0.25,
      5,
      'fey',
      'S',
      '%,forest,%',
      50,
      100,
    ]);
    expect(q.sql).toContain('r.is_npc = 0');
  });

  it('clamps the limit', () => {
    expect(buildSearch({ kind: 'spell', limit: 99999 }).params).toEqual([
      '2024',
      'spell',
      '',
      2000,
      0,
    ]);
    expect(buildSearch({ kind: 'spell', limit: 0 }).params).toEqual(['2024', 'spell', '', 1, 0]);
  });
});

describe('campaign creatures in every query (ADR 0035)', () => {
  it('shows only the open campaign’s creatures and never groups them with Library records', () => {
    const q = buildSearch({ kind: 'monster', campaignSourceId: 'campaign:greyford' });
    expect(q.sql).toContain("(s.kind != 'campaign' OR r.source_id = ?)");
    expect(q.sql).toContain(
      "CASE WHEN s.kind = 'campaign' THEN r.source_id || char(31) || r.key ELSE r.key END AS group_key",
    );
    expect(q.params).toEqual(['2024', 'monster', 'campaign:greyford', 200, 0]);
    expect(buildSuggest('gob', 12, '2024', 'campaign:greyford').params[5]).toBe(
      'campaign:greyford',
    );
    expect(buildTextSearch('gob', 12, '2024', 'campaign:greyford')!.params[3]).toBe(
      'campaign:greyford',
    );
    expect(buildSuggest('gob').sql).toContain('PARTITION BY kind, group_key');
  });
});

describe('parseEditions', () => {
  it('lists the row’s own edition first, then the others once each', () => {
    expect(parseEditions('2024', '2014,2024,2014')).toEqual(['2024', '2014']);
    expect(parseEditions('2014', '2014')).toEqual(['2014']);
    expect(parseEditions('2014', null)).toEqual(['2014']);
  });
});

describe('parseVersions', () => {
  it('lists the other versions by priority, the row’s own left out once', () => {
    const v = (p: number, s: string, e: string) => `${p}\u001f${s}\u001f${e}`;
    const joined = [v(2, 'SRD 5.1', '2014'), v(0, 'Mine', '2024'), v(1, 'SRD 5.2', '2024')].join(
      '\u001e',
    );
    expect(parseVersions('Mine', '2024', joined)).toEqual([
      { sourceName: 'SRD 5.2', edition: '2024' },
      { sourceName: 'SRD 5.1', edition: '2014' },
    ]);
    expect(parseVersions('Mine', '2024', v(0, 'Mine', '2024'))).toEqual([]);
    expect(parseVersions('Mine', '2024', null)).toEqual([]);
  });
});

describe('buildSuggest', () => {
  it('ranks exact, prefix, word and substring across every kind, editions collapsed', () => {
    const q = buildSuggest('gob', 12, '2014');
    expect(q.sql).toContain("r.display_name LIKE ? ESCAPE '\\'");
    expect(q.sql).toContain('PARTITION BY kind, group_key');
    expect(q.sql).toContain('WHERE rn = 1 ORDER BY tier, display_name COLLATE NOCASE');
    expect(q.sql).not.toContain('r.kind = ?');
    expect(q.sql).toContain('s.enabled = 1');
    expect(q.params).toEqual(['2014', 'gob', 'gob%', '% gob%', '%gob%', '', 12]);
  });

  it('escapes LIKE wildcards, folds case and clamps the limit', () => {
    expect(likeEscape('50%_off\\')).toBe('50\\%\\_off\\\\');
    const q = buildSuggest('  Ring_of 50% ', 500);
    expect(q.params[1]).toBe('ring_of 50%');
    expect(q.params[4]).toBe('%ring\\_of 50\\%%');
    expect(q.params[6]).toBe(100);
    expect(buildSuggest('x', 0).params[6]).toBe(1);
  });
});

describe('buildTextSearch', () => {
  it('matches the phrase in the text column, leaves out name matches, collapses editions', () => {
    expect(buildPhraseMatch('  owes the  party ')).toBe('text : "owes the party"*');
    expect(buildPhraseMatch('a"b')).toBe('text : "a""b"*');
    expect(buildPhraseMatch(' ')).toBeNull();
    const q = buildTextSearch('Mucous cloud', 12, '2014')!;
    expect(q.sql).toContain('snippet(records_fts, 2');
    expect(q.sql).toContain("r.display_name NOT LIKE ? ESCAPE '\\'");
    expect(q.sql).toContain('PARTITION BY kind, group_key');
    expect(q.sql).toContain('WHERE rn = 1 ORDER BY rank');
    expect(q.params).toEqual(['2014', 'text : "Mucous cloud"*', '%mucous cloud%', '', 12]);
    expect(buildTextSearch('x', 999)!.params[4]).toBe(100);
    expect(buildTextSearch('  ')).toBeNull();
  });
});

describe('splitSnippet', () => {
  it('joins the marked words of a phrase into one match and drops later marks', () => {
    expect(
      splitSnippet('…makes two \u0001Mucous\u0002 \u0001Cloud\u0002 attacks \u0001cloud\u0002…'),
    ).toEqual({
      before: '…makes two ',
      match: 'Mucous Cloud',
      after: ' attacks cloud…',
    });
    expect(splitSnippet('plain text')).toEqual({ before: '', match: '', after: 'plain text' });
  });
});
