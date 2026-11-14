import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type {
  CombatantTemplate,
  CombatState,
  CompendiumRecord,
  Encounter,
  Scene,
} from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { registerBuilderDraft } from './builderDraft';
import { applyScope, draftFromRow, editRow, useCreatureEditStore } from './creatureEdits';

const now = '2026-11-14T00:00:00.000Z';

const goblin = {
  id: 'srd:monster:goblin',
  kind: 'monster',
  key: 'goblin',
  name: 'Goblin',
  displayName: 'Goblin',
  sourceId: 'srd',
  edition: '2024',
  data: {
    hp: { average: 7, formula: '2d6' },
    ac: { value: 15 },
    cr: '1/4',
    xp: 50,
    type: 'humanoid',
  },
} as unknown as CompendiumRecord;

const grik = {
  ...goblin,
  id: 'creature:monster:grik',
  key: 'grik',
  name: 'Grik',
  displayName: 'Grik',
  sourceId: 'campaign:greyford',
  data: { hp: { average: 12 }, ac: { value: 16 }, cr: '1/2', xp: 100, type: 'humanoid' },
} as unknown as CompendiumRecord;

const goblinRef = {
  kind: 'record',
  ref: { recordId: goblin.id, sourceId: 'srd', key: 'goblin', edition: '2024' },
  name: 'Goblin',
} as const;

const row = (id: string, extra: Partial<CombatantTemplate> = {}): CombatantTemplate => ({
  id,
  ref: goblinRef,
  quantity: 2,
  role: 'enemy',
  hidden: false,
  ...extra,
});

const encounter = (id: string, combatants: CombatantTemplate[]): Encounter => ({
  schemaVersion: 1,
  id,
  name: id,
  combatants,
  notes: '',
  state: null,
  results: [],
  createdAt: now,
  updatedAt: now,
});

const original = { identity: { id: goblin.id, sourceId: 'srd', key: 'goblin' }, name: 'Goblin' };
const isGrik = (t: { ref: { kind: string } }) =>
  t.ref.kind === 'record' && (t.ref as typeof goblinRef).ref.recordId === grik.id;

describe('draftFromRow', () => {
  it('names the copy after the row’s label and gives it the HP override', () => {
    const d = draftFromRow(goblin, { ...row('r'), label: 'Grik', hpOverride: 12 });
    expect(d).toMatchObject({ displayName: 'Grik', key: 'grik' });
    expect(d.kind === 'monster' && d.data.hp).toEqual({ average: 12 });
  });

  it('keeps the name and HP when the row changed neither', () => {
    const d = draftFromRow(goblin, { ...row('r'), label: 'goblin' });
    expect(d.displayName).toBe('Goblin');
    expect(d.kind === 'monster' && d.data.hp).toEqual({ average: 7, formula: '2d6' });
  });
});

describe('applyScope', () => {
  const bridge = encounter('Bridge', [
    row('r1', { label: 'Lookouts', hpOverride: 12, tokenIds: ['t1'] }),
    row('r2', { label: 'Guards' }),
  ]);
  const mill = encounter('Mill', [row('r3', { label: 'Raiders' })]);
  const map = {
    id: 's1',
    tokens: [
      { id: 't1', kind: 'creature', ref: goblinRef, label: 'Goblin 1' },
      { id: 't9', kind: 'creature', ref: goblinRef, label: 'Goblin 9' },
    ],
  } as unknown as Scene;

  beforeEach(() => {
    registerBuilderDraft(null);
    useCombatStore.setState({ encounterId: null, state: null });
    useCampaignStore.setState({
      current: {
        campaign: { id: 'c1', name: 'Greyford', slug: 'greyford', settings: {} },
        encounters: [bridge, mill],
        scenes: [map],
        pcs: [],
        npcs: [],
      } as unknown as CampaignBundle,
    });
    vi.mocked(window.trifold.encounters.save).mockImplementation(async (e) => e);
    vi.mocked(window.trifold.scenes.save).mockImplementation(async (s) => s);
  });

  const saved = () => vi.mocked(window.trifold.encounters.save).mock.calls.map((c) => c[0]);
  const lastScene = () => vi.mocked(window.trifold.scenes.save).mock.calls.at(-1)?.[0];
  const rowOrigin = { kind: 'row', encounterId: 'Bridge', templateId: 'r1' } as const;

  it('this row: the row takes the creature, its name and HP; its tokens follow', async () => {
    await applyScope('row', rowOrigin, original, grik);
    const bridgeNow = saved().at(-1)!;
    const [edited, other] = bridgeNow.combatants;
    expect(isGrik(edited!)).toBe(true);
    expect(edited!.label).toBeUndefined();
    expect(edited!.hpOverride).toBeUndefined();
    expect(other).toMatchObject({ ref: goblinRef, label: 'Guards' });
    expect(saved().map((e) => e.id)).toEqual(['Bridge']);
    expect(lastScene()!.tokens.map((t) => t.ref.name)).toEqual(['Grik', 'Goblin']);
  });

  it('every one in this encounter: its other rows too, keeping their labels; other encounters wait', async () => {
    await applyScope('encounter', rowOrigin, original, grik);
    const last = saved().at(-1)!;
    expect(last.id).toBe('Bridge');
    expect(last.combatants.every(isGrik)).toBe(true);
    expect(last.combatants[1]).toMatchObject({ label: 'Guards' });
    expect(saved().some((e) => e.id === 'Mill')).toBe(false);
  });

  it('every one in the campaign: other encounters and maps too', async () => {
    await applyScope('campaign', rowOrigin, original, grik);
    const mill = saved().find((e) => e.id === 'Mill')!;
    expect(mill.combatants[0]).toMatchObject({ label: 'Raiders' });
    expect(isGrik(mill.combatants[0]!)).toBe(true);
    expect(lastScene()!.tokens.every((t) => t.ref.name === 'Grik')).toBe(true);
  });

  it('nowhere yet changes nothing', async () => {
    await applyScope('none', { kind: 'record' }, original, grik);
    expect(window.trifold.encounters.save).not.toHaveBeenCalled();
  });

  it('just this fighter: it leaves its group as its own row, keeping its HP', () => {
    const state = {
      round: 1,
      turnIndex: 0,
      combatants: [
        {
          id: 'c1',
          templateId: 'r1',
          name: 'Goblin 1',
          ref: goblinRef,
          recordId: goblin.id,
          hp: { current: 3, max: 7, temp: 0 },
          conditions: [],
        },
        {
          id: 'c2',
          templateId: 'r1',
          name: 'Goblin 2',
          ref: goblinRef,
          recordId: goblin.id,
          hp: { current: 7, max: 7, temp: 0 },
          conditions: [],
        },
      ],
      log: [],
    } as unknown as CombatState;
    useCombatStore.setState({ encounterId: 'Bridge', state });
    void applyScope(
      'one',
      {
        kind: 'fighter',
        encounterId: 'Bridge',
        templateId: 'r1',
        combatantId: 'c2',
        fighterName: 'Goblin 2',
      },
      original,
      grik,
    );
    const fighters = useCombatStore.getState().state!.combatants;
    expect(isGrik(fighters[1]!)).toBe(true);
    expect(fighters[1]!.hp.current).toBe(7);
    expect(fighters[1]!.templateId).not.toBe('r1');
    expect(isGrik(fighters[0]!)).toBe(false);
  });
});

describe('editRow', () => {
  it('opens the editor on an unsaved copy named after the row', async () => {
    vi.mocked(window.trifold.homebrew.draft).mockResolvedValue({
      ...goblin,
      id: 'homebrew:monster:new',
      sourceId: 'homebrew',
    } as CompendiumRecord);
    await editRow(encounter('Bridge', []), row('r1', { label: 'Grik' }));
    const edit = useCreatureEditStore.getState().edit!;
    expect(edit.title).toBe('Edit Grik');
    expect(edit.record.displayName).toBe('Grik');
    expect(edit.origin).toEqual({ kind: 'row', encounterId: 'Bridge', templateId: 'r1' });
    expect(edit.original.identity).toEqual({ id: goblin.id, sourceId: 'srd', key: 'goblin' });
    expect(window.trifold.homebrew.save).not.toHaveBeenCalled();
  });
});
