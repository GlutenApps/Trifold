import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type { Campaign, MonsterRecord, SummonableEntry } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { blankRecord } from '../compendium/homebrew';
import { SummonsTab } from './SummonsTab';

const blank = blankRecord('monster') as MonsterRecord;
const wolf: MonsterRecord = {
  ...blank,
  id: 'srd:monster:wolf',
  key: 'wolf',
  name: 'Wolf',
  displayName: 'Wolf',
  sourceId: 'srd',
  data: { ...blank.data, size: 'M', type: 'beast', ac: { value: 13 }, hp: { average: 11 } },
};

let summonable: SummonableEntry[] = [];
const update = vi.fn(async (patch: Partial<Campaign>) => {
  summonable = patch.settings!.summonable;
  setCampaign();
});

function setCampaign() {
  useCampaignStore.setState({
    current: {
      campaign: { id: 'c', slug: 'greyford', name: 'Greyford', settings: { summonable } },
      pcs: [],
      npcs: [],
      scenes: [],
    } as unknown as CampaignBundle,
    update,
  } as never);
}

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

describe('Campaign › Companions', () => {
  beforeEach(() => {
    summonable = [];
    update.mockClear();
    setCampaign();
    vi.mocked(window.trifold.compendium.get).mockImplementation(async (id) =>
      id === wolf.id ? wolf : null,
    );
  });

  it('adds a creature from a compendium search', async () => {
    vi.mocked(window.trifold.compendium.suggest).mockResolvedValue([
      {
        id: wolf.id,
        kind: 'monster',
        displayName: 'Wolf',
        type: 'beast',
        sourceName: 'SRD',
      } as never,
    ]);
    render(<SummonsTab />);
    fireEvent.change(screen.getByLabelText('Add a companion from the compendium'), {
      target: { value: 'wol' },
    });
    await act(async () => new Promise((r) => setTimeout(r, 200)));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    });
    await flush();
    expect(summonable).toEqual([
      expect.objectContaining({
        name: 'Wolf',
        type: 'beast',
        ac: 13,
        hp: 11,
        ref: expect.objectContaining({ recordId: wolf.id }),
      }),
    ]);
  });

  it('customises a stock creature as this campaign’s copy, in the same place on the list', async () => {
    summonable = [
      {
        ref: { recordId: wolf.id, sourceId: 'srd', key: 'wolf', edition: '2024' },
        name: 'Wolf',
        type: 'beast',
        size: 'M',
        ac: 13,
        hp: 11,
      },
    ];
    setCampaign();
    const copy = { ...wolf, id: 'creature:monster:1', sourceId: 'campaign:greyford' };
    vi.mocked(window.trifold.homebrew.draft).mockResolvedValue(copy);
    vi.mocked(window.trifold.homebrew.save).mockImplementation(async (r) => ({
      ...(r as MonsterRecord),
      displayName: 'Dire wolf pup',
      data: { ...(r as MonsterRecord).data, hp: { average: 20 } },
    }));
    render(<SummonsTab />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Edit Wolf' }));
    });
    await flush();
    expect(window.trifold.homebrew.draft).toHaveBeenCalledWith(wolf.id, 'campaign');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
    });
    await flush();
    expect(summonable).toHaveLength(1);
    expect(summonable[0]).toMatchObject({
      name: 'Dire wolf pup',
      hp: 20,
      ref: { recordId: 'creature:monster:1', sourceId: 'campaign:greyford' },
    });
  });

  it('makes a new summon in this campaign', async () => {
    vi.mocked(window.trifold.homebrew.save).mockImplementation(async (r) => ({
      ...(r as MonsterRecord),
      displayName: 'Spiritual weapon',
      name: 'Spiritual weapon',
    }));
    render(<SummonsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'New companion' }));
    fireEvent.change(screen.getByLabelText('Name', { exact: true }), {
      target: { value: 'Spiritual weapon' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
    });
    await flush();
    const saved = vi.mocked(window.trifold.homebrew.save).mock.calls.at(-1)![0];
    expect(saved).toMatchObject({ sourceId: 'campaign:greyford', kind: 'monster' });
    expect(saved.id).toMatch(/^creature:monster:/);
    expect(summonable.map((e) => e.name)).toEqual(['Spiritual weapon']);
  });

  it('takes a creature off the list without touching the compendium', async () => {
    summonable = [
      {
        ref: { recordId: wolf.id, sourceId: 'srd', key: 'wolf', edition: '2024' },
        name: 'Wolf',
        type: 'beast',
        size: 'M',
        ac: 13,
        hp: 11,
      },
    ];
    setCampaign();
    render(<SummonsTab />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Take Wolf off the companion list' }));
    });
    expect(summonable).toEqual([]);
    expect(window.trifold.homebrew.remove).not.toHaveBeenCalled();
  });
});
