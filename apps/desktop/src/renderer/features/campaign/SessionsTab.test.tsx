import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type { Session } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { flushPendingSaves } from '../../stores/pendingSaves';
import { SessionsTab } from './SessionsTab';

/** The Sessions sub-tab (ADR 0040). */
const base = (id: string, startedAt: string, extra: Partial<Session> = {}): Session => ({
  schemaVersion: 1,
  id,
  title: '',
  recap: '',
  events: [],
  startedAt,
  lastActivityAt: startedAt,
  createdAt: startedAt,
  updatedAt: startedAt,
  ...extra,
});

const older = base('s1', '2026-11-07T19:00:00.000Z', {
  events: [
    {
      kind: 'fight',
      at: '2026-11-07T20:00:00.000Z',
      encounterId: 'e1',
      name: 'Wolves',
      xp: 200,
      rounds: 3,
      casualties: [],
      pcs: 4,
    },
  ],
});
const newer = base('s2', '2026-11-14T19:00:00.000Z', {
  events: [
    {
      kind: 'fight',
      at: '2026-11-14T20:00:00.000Z',
      encounterId: 'e2',
      name: 'Mill fight',
      xp: 400,
      rounds: 4,
      casualties: ['Zed'],
      pcs: 4,
    },
    { kind: 'scene', at: '2026-11-14T19:05:00.000Z', sceneId: 'sc', title: 'The old mill' },
    { kind: 'death', at: '2026-11-14T20:01:00.000Z', npcId: 'n1', name: 'Captain Vex' },
  ],
});

describe('SessionsTab', () => {
  beforeEach(() => {
    vi.mocked(window.trifold.sessions.save).mockImplementation(async (s: Session) => ({
      ...s,
      id: s.id || 'S-new',
    }));
    useCampaignStore.setState({
      current: { campaign: { id: 'c1' }, sessions: [newer, older] } as unknown as CampaignBundle,
    });
  });

  it('shows campaign XP, the newest session open with what happened, older ones folded', async () => {
    render(<SessionsTab />);
    expect(screen.getByTestId('campaign-xp')).toHaveTextContent('Campaign XP 600 · 150 per PC');
    const [first, second] = screen.getAllByTestId('session-card');
    expect(within(first!).getByRole('button', { name: /^Session 2/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(first).toHaveTextContent('Mill fight');
    expect(first).toHaveTextContent('400 XP (100 per PC) · 4 rounds · fell: Zed');
    expect(first).toHaveTextContent('The old mill');
    expect(first).toHaveTextContent('Captain Vex');
    expect(second).toHaveTextContent('Session 1');
    expect(second).toHaveTextContent('1 fight · 200 XP');

    await userEvent.click(within(second!).getByRole('button', { name: /^Session 1/ }));
    expect(second).toHaveTextContent('Wolves');
  });

  it('saves a title, starts a session by hand, and deletes one after asking', async () => {
    render(<SessionsTab />);
    const first = screen.getAllByTestId('session-card')[0]!;
    await userEvent.type(within(first).getByLabelText('Title'), 'The mill');
    await flushPendingSaves();
    await waitFor(() =>
      expect(window.trifold.sessions.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 's2', title: 'The mill' }),
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'New session' }));
    await waitFor(() => expect(screen.getAllByTestId('session-card')).toHaveLength(3));

    await userEvent.click(screen.getByRole('button', { name: 'Delete Session 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(window.trifold.sessions.remove).toHaveBeenCalledWith('s1'));
  });
});
