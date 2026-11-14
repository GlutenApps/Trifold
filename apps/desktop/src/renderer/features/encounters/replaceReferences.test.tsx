import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type {
  Combatant,
  CombatantTemplate,
  CompendiumRecord,
  Encounter,
  Scene,
} from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { ReplaceInCampaign } from '../compendium/ReplaceInCampaign';
import { describePlan, planReplace } from './replaceReferences';
import { recordTarget } from './creatureEdits';
import { refersTo, type RecordIdentity } from './templates';

const now = '2026-11-14T00:00:00.000Z';

const goblin = {
  id: 'srd:monster:goblin',
  kind: 'monster',
  key: 'goblin',
  name: 'Goblin',
  displayName: 'Goblin',
  sourceId: 'srd',
  edition: '2024',
  data: { hp: { average: 7 }, ac: { value: 15 }, cr: '1/4', xp: 50, type: 'humanoid' },
} as unknown as CompendiumRecord;
const grik = {
  ...goblin,
  id: 'homebrew:monster:grik',
  key: 'grik',
  name: 'Grik',
  displayName: 'Grik',
  sourceId: 'homebrew',
  basedOn: { recordId: goblin.id, sourceId: 'srd' },
  data: { hp: { average: 12 }, ac: { value: 16 }, cr: '1/2', xp: 100, type: 'humanoid' },
} as unknown as CompendiumRecord;
const fromGoblin: RecordIdentity = { id: goblin.id, sourceId: 'srd', key: 'goblin' };

const goblinRef = (recordId = goblin.id) =>
  ({
    kind: 'record',
    ref: { recordId, sourceId: 'srd', key: 'goblin', edition: '2024' },
    name: 'Goblin',
  }) as const;

const row = (id: string, extra: Partial<CombatantTemplate> = {}): CombatantTemplate => ({
  id,
  ref: goblinRef(),
  quantity: 2,
  role: 'enemy',
  hidden: false,
  ...extra,
});

const encounter = (id: string, combatants: CombatantTemplate[], extra: Partial<Encounter> = {}) =>
  ({
    schemaVersion: 1,
    id,
    name: id,
    combatants,
    notes: '',
    state: null,
    results: [],
    createdAt: now,
    updatedAt: now,
    ...extra,
  }) as Encounter;

const fighter = (id: string, ref = goblinRef()) =>
  ({
    id,
    name: id,
    ref,
    recordId: goblin.id,
    hp: { current: 3, max: 7, temp: 0 },
  }) as unknown as Combatant;

const map = {
  id: 's1',
  tokens: [
    { id: 't1', kind: 'creature', ref: goblinRef(), label: 'Goblin 1' },
    { id: 't2', kind: 'creature', ref: goblinRef('srd:monster:old-id'), label: 'Goblin 2' },
    { id: 'm', kind: 'marker', ref: { kind: 'custom', name: 'Goblin' }, label: 'Trap' },
  ],
} as unknown as Scene;

describe('refersTo', () => {
  it('matches the same record, or the same key in the same source after a re-import', () => {
    expect(refersTo(goblinRef(), fromGoblin)).toBe(true);
    expect(refersTo(goblinRef('srd:monster:old-id'), fromGoblin)).toBe(true);
    expect(
      refersTo({ ...goblinRef(), ref: { ...goblinRef().ref, sourceId: 'book' } } as never, {
        ...fromGoblin,
        id: 'x',
      }),
    ).toBe(false);
    expect(refersTo({ kind: 'custom', name: 'Goblin' }, fromGoblin)).toBe(false);
    // Without a key (the original is gone), only the id matches.
    expect(refersTo(goblinRef('srd:monster:old-id'), { ...fromGoblin, key: '' })).toBe(false);
  });
});

describe('planReplace', () => {
  const to = recordTarget(grik);

  it('switches rows, saved fights and tokens, keeping labels and HP overrides, and skips markers', () => {
    const plan = planReplace(
      {
        encounters: [
          encounter('Bridge', [row('r1', { label: 'Lookouts', hpOverride: 9 }), row('r2')]),
          encounter('Mill', [row('r3', { ref: { kind: 'custom', name: 'Ogre' } })]),
          encounter('Camp', [row('r4')], {
            state: { round: 2, turnIndex: 0, combatants: [fighter('g1')], log: [] } as never,
          }),
        ],
        scenes: [map],
      },
      fromGoblin,
      to,
    );
    expect(plan.encounters.map((e) => e.id)).toEqual(['Bridge', 'Camp']);
    expect(plan).toMatchObject({ rows: 3, fights: 1, tokens: 2 });
    const bridge = plan.encounters[0]!.combatants;
    expect(bridge[0]).toMatchObject({
      ref: to.ref,
      label: 'Lookouts',
      hpOverride: 9,
      cache: to.cache,
    });
    expect(plan.encounters[1]!.state!.combatants[0]).toMatchObject({
      ref: to.ref,
      recordId: grik.id,
      hp: { current: 3 },
    });
    expect(plan.scenes[0]!.tokens.map((t) => t.ref.kind === 'record' && t.ref.name)).toEqual([
      'Grik',
      'Grik',
      false,
    ]);
    expect(describePlan(plan)).toBe('2 encounters (3 rows), 1 fight and 2 tokens');
  });

  it('counts the tracker’s fight from the tracker, not the saved state', () => {
    const plan = planReplace(
      {
        encounters: [encounter('Live', [row('r1', { ref: { kind: 'custom', name: 'Wolf' } })])],
        scenes: [],
      },
      fromGoblin,
      to,
      { encounterId: 'Live', combatants: [fighter('g1')] },
    );
    expect(plan).toMatchObject({ rows: 0, fights: 1 });
    expect(describePlan(plan)).toBe('1 fight');
  });

  it('says nothing when the campaign does not use the record', () => {
    const plan = planReplace({ encounters: [], scenes: [] }, fromGoblin, to);
    expect(describePlan(plan)).toBe('');
  });
});

describe('ReplaceInCampaign', () => {
  beforeEach(() => {
    useCombatStore.setState({ encounterId: null, state: null });
    useCampaignStore.setState({
      current: {
        campaign: { id: 'c1', name: 'Greyford', settings: {} },
        encounters: [encounter('Bridge', [row('r1')])],
        scenes: [map],
        pcs: [],
        npcs: [],
      } as unknown as CampaignBundle,
    });
    vi.mocked(window.trifold.compendium.get).mockImplementation(async (id) =>
      id === goblin.id ? goblin : null,
    );
    vi.mocked(window.trifold.encounters.save).mockImplementation(async (e) => e);
    vi.mocked(window.trifold.scenes.save).mockImplementation(async (s) => s);
  });

  it('replaces the original after showing what will change, then offers to put it back', async () => {
    render(<ReplaceInCampaign record={grik} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Replace Goblin in this campaign…' }),
    );
    expect(
      screen.getByText(
        'Use Grik in place of Goblin in 1 encounter and 2 tokens? Labels and HP overrides stay.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Replace' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Grik now stands in for Goblin in 1 encounter and 2 tokens.',
      ),
    );
    expect(window.trifold.encounters.save).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('button', { name: 'Put Goblin back in this campaign…' }),
    ).toBeInTheDocument();
  });

  it('says so when the campaign uses neither', async () => {
    useCampaignStore.setState({
      current: { ...useCampaignStore.getState().current!, encounters: [], scenes: [] },
    });
    render(<ReplaceInCampaign record={grik} />);
    expect(
      await screen.findByText('Greyford does not use Goblin or Grik in any encounter or map.'),
    ).toBeInTheDocument();
  });
});
