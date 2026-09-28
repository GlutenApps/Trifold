import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCompendiumXml } from '@trifold/importers';
import { describe, expect, it } from 'vitest';
import { buildFtsMatch, buildSearch, indexText, recordColumns } from './query';

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
    expect(q.sql).toContain('ORDER BY r.display_name COLLATE NOCASE');
    expect(q.params).toEqual(['monster', 200, 0]);
    expect(q.countParams).toEqual(['monster']);
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
    expect(q.sql).toContain('ORDER BY bm25(records_fts)');
    expect(q.params).toEqual([
      'monster',
      '"gob"*',
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
    expect(buildSearch({ kind: 'spell', limit: 99999 }).params).toEqual(['spell', 2000, 0]);
    expect(buildSearch({ kind: 'spell', limit: 0 }).params).toEqual(['spell', 1, 0]);
  });
});
