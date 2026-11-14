import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type { CombatantTemplate, CompendiumRecord, Encounter, Scene } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { registerBuilderDraft } from './builderDraft';
import { draftFromRow, saveToCompendium } from './saveToCompendium';

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

const draftOf = (r: CompendiumRecord): CompendiumRecord =>
  ({
    ...r,
    id: 'homebrew:monster:new',
    sourceId: 'homebrew',
    name: `Copy of ${r.displayName}`,
    displayName: `Copy of ${r.displayName}`,
    key: `copy of ${r.key}`,
  }) as CompendiumRecord;

const row: CombatantTemplate = {
  id: 'row1',
  ref: {
    kind: 'record',
    ref: { recordId: goblin.id, sourceId: 'srd', key: 'goblin', edition: '2024' },
    name: 'Goblin',
  },
  label: 'Grik',
  quantity: 2,
  role: 'enemy',
  hidden: false,
  hpOverride: 12,
  tokenIds: ['tk1', 'tk2'],
  cache: { xp: 50, cr: '1/4', type: 'humanoid', hp: 7, ac: 15 },
};

const ambush: Encounter = {
  schemaVersion: 1,
  id: 'e1',
  name: 'Bridge ambush',
  combatants: [row],
  notes: '',
  state: null,
  results: [],
  createdAt: now,
  updatedAt: now,
};

const bridge = {
  id: 's1',
  tokens: [
    { id: 'tk1', kind: 'creature', ref: row.ref, label: 'Grik 1' },
    { id: 'other', kind: 'creature', ref: row.ref, label: 'Goblin' },
  ],
} as unknown as Scene;

describe('draftFromRow', () => {
  it('names the copy after the row’s label and gives it the HP override', () => {
    const d = draftFromRow(draftOf(goblin), row);
    expect(d).toMatchObject({ displayName: 'Grik', key: 'grik' });
    expect(d.kind === 'monster' && d.data.hp).toEqual({ average: 12 });
  });

  it('keeps the copy’s own name and HP when the row changed neither', () => {
    const d = draftFromRow(draftOf(goblin), { ...row, label: 'goblin', hpOverride: undefined });
    expect(d.displayName).toBe('Copy of Goblin');
    expect(d.kind === 'monster' && d.data.hp).toEqual({ average: 7, formula: '2d6' });
  });
});

describe('saveToCompendium', () => {
  beforeEach(() => {
    registerBuilderDraft(null);
    useCombatStore.setState({ encounterId: null, state: null });
    useCampaignStore.setState({
      current: {
        campaign: { id: 'c1', settings: {} },
        encounters: [ambush],
        scenes: [bridge],
        pcs: [],
        npcs: [],
      } as unknown as CampaignBundle,
    });
    useCompendiumStore.setState({ editing: null, draftFrom: null, kind: 'monster' });
    vi.mocked(window.trifold.homebrew.draft).mockImplementation(async () => draftOf(goblin));
    vi.mocked(window.trifold.homebrew.save).mockImplementation(async (r) => r);
    vi.mocked(window.trifold.encounters.save).mockImplementation(async (e) => e);
    vi.mocked(window.trifold.scenes.save).mockImplementation(async (s) => s);
  });

  it('opens the copy in the editor, unsaved, offering three ways to use it', async () => {
    await saveToCompendium(ambush, row);
    const { editing, editingNew, draftFrom, draftChoice } = useCompendiumStore.getState();
    expect(editing).toMatchObject({ displayName: 'Grik', sourceId: 'homebrew' });
    expect(editingNew).toBe(true);
    expect(draftChoice).toBe('encounter');
    expect(draftFrom?.choices.map((c) => c.label)).toEqual([
      'Use it in Bridge ambush',
      'Use it everywhere in this campaign',
      'Just save it',
    ]);
    expect(draftFrom?.choices[0]!.detail).toBe(
      'Every Grik in that row. Other encounters keep the original.',
    );
    expect(window.trifold.homebrew.save).not.toHaveBeenCalled();
  });

  it('on Save, points the row and its tokens at the new record and drops the HP override', async () => {
    await saveToCompendium(ambush, row);
    const draft = useCompendiumStore.getState().editing!;
    expect(await useCompendiumStore.getState().saveHomebrew(draft)).toBe(true);

    const saved = vi.mocked(window.trifold.encounters.save).mock.calls.at(-1)![0];
    const moved = saved.combatants[0]!;
    expect(moved.ref).toEqual({
      kind: 'record',
      ref: { recordId: 'homebrew:monster:new', sourceId: 'homebrew', key: 'grik', edition: '2024' },
      name: 'Grik',
    });
    expect(moved.hpOverride).toBeUndefined();
    expect(moved).toMatchObject({ label: 'Grik', quantity: 2, cache: { hp: 12, ac: 15 } });

    const scene = vi.mocked(window.trifold.scenes.save).mock.calls.at(-1)![0];
    expect(scene.tokens.map((t) => t.ref)).toEqual([moved.ref, row.ref]);
    expect(useCompendiumStore.getState().draftFrom).toBeNull();
  });

  it('leaves the encounter alone with Just save it', async () => {
    await saveToCompendium(ambush, row);
    useCompendiumStore.getState().setDraftChoice('none');
    await useCompendiumStore.getState().saveHomebrew(useCompendiumStore.getState().editing!);
    expect(window.trifold.homebrew.save).toHaveBeenCalled();
    expect(window.trifold.encounters.save).not.toHaveBeenCalled();
  });

  it('with Use it everywhere, replaces the original in every encounter and keeps row tweaks', async () => {
    const other: Encounter = {
      ...ambush,
      id: 'e2',
      name: 'Mill raid',
      combatants: [{ ...row, id: 'row2', label: undefined, hpOverride: undefined }],
    };
    useCampaignStore.setState({
      current: {
        ...useCampaignStore.getState().current!,
        encounters: [ambush, other],
      },
    });
    await saveToCompendium(ambush, row);
    useCompendiumStore.getState().setDraftChoice('campaign');
    await useCompendiumStore.getState().saveHomebrew(useCompendiumStore.getState().editing!);

    const saved = vi.mocked(window.trifold.encounters.save).mock.calls.map((c) => c[0]);
    expect(saved.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
    for (const e of saved) {
      expect(e.combatants[0]!.ref.kind === 'record' && e.combatants[0]!.ref.ref.recordId).toBe(
        'homebrew:monster:new',
      );
    }
    // A replace keeps the DM's per-encounter choices.
    expect(saved.find((e) => e.id === 'e1')!.combatants[0]).toMatchObject({
      label: 'Grik',
      hpOverride: 12,
    });
    const scene = vi.mocked(window.trifold.scenes.save).mock.calls.at(-1)![0];
    expect(scene.tokens.every((t) => t.ref.kind === 'record' && t.ref.name === 'Grik')).toBe(true);
  });

  it('switches the builder’s own copy while the builder shows the encounter', async () => {
    const editTemplates = vi.fn();
    registerBuilderDraft({ encounterId: 'e1', editTemplates });
    await saveToCompendium(ambush, row);
    await useCompendiumStore.getState().saveHomebrew(useCompendiumStore.getState().editing!);
    expect(editTemplates).toHaveBeenCalledTimes(1);
    const [moved] = editTemplates.mock.calls[0]![0]([row]) as CombatantTemplate[];
    expect(moved).toMatchObject({ cache: { hp: 12 } });
    expect(window.trifold.encounters.save).not.toHaveBeenCalled();
  });
});
