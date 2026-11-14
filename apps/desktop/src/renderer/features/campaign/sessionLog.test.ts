import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type { NPC, Session, SessionEvent } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { usePresenterStore } from '../../stores/presenterStore';
import {
  blankSession,
  campaignXp,
  installSessionLog,
  openSession,
  recordEvent,
  recordFight,
  sessionName,
  sessionSummary,
  sessionXp,
  updateSession,
  withEvent,
} from './sessionLog';

/** The session log (ADR 0040): one entry per session of play, filled as things happen. */
const at = (h: number) => new Date(Date.UTC(2026, 10, 14, h)).toISOString();
const session = (id: string, startedH: number, lastH: number, events: SessionEvent[] = []) => ({
  ...blankSession(at(startedH)),
  id,
  lastActivityAt: at(lastH),
  events,
});
const fight = (xp: number, pcs: number, h = 20): SessionEvent => ({
  kind: 'fight',
  at: at(h),
  encounterId: `e${xp}`,
  name: 'Bridge ambush',
  xp,
  rounds: 3,
  casualties: [],
  pcs,
});

describe('session log rules', () => {
  it('keeps a session open until play has stopped for six hours, across midnight too', () => {
    const evening = session('a', 19, 23);
    expect(openSession([evening], at(23 + 2))?.id).toBe('a');
    expect(openSession([evening], at(23 + 6))).toBeNull();
    expect(openSession([], at(20))).toBeNull();
    // The most recently active one is the one that takes events.
    expect(openSession([session('old', 1, 2), evening], at(23))?.id).toBe('a');
  });

  it('adds events, starts a session when none is open, and lists a scene or death once', () => {
    const scene: SessionEvent = { kind: 'scene', at: at(20), sceneId: 's1', title: 'The keep' };
    const started = withEvent(null, scene);
    expect(started).toMatchObject({ id: '', startedAt: at(20), events: [scene] });
    const again = withEvent(started, { ...scene, at: at(21) });
    expect(again.events).toHaveLength(1);
    expect(again.lastActivityAt).toBe(at(21));
    const death: SessionEvent = { kind: 'death', at: at(21), npcId: 'n1', name: 'Vex' };
    expect(withEvent(withEvent(started, death), death).events).toHaveLength(2);
  });

  it('totals XP per session and per PC across the campaign, and summarises a session', () => {
    const one = session('a', 19, 22, [fight(450, 4), fight(100, 0)]);
    expect(sessionXp(one)).toEqual({ xp: 550, perPc: 112 });
    expect(campaignXp([one, session('b', 1, 2, [fight(200, 2)])])).toEqual({
      xp: 750,
      perPc: 212,
    });
    expect(
      sessionSummary({
        events: [fight(450, 4), { kind: 'scene', at: at(20), sceneId: 's', title: 'T' }],
      }),
    ).toBe('1 fight · 450 XP · 1 scene');
    expect(sessionSummary({ events: [] })).toBe('Nothing recorded yet');
  });

  it('names an untitled session by its place, counting from the first', () => {
    const first = session('a', 1, 2);
    const second = { ...session('b', 5, 6), title: '' };
    const titled = { ...session('c', 9, 10), title: 'The heist' };
    const all = [titled, second, first];
    expect(sessionName(all, first)).toBe('Session 1');
    expect(sessionName(all, second)).toBe('Session 2');
    expect(sessionName(all, titled)).toBe('The heist');
  });
});

describe('session log recorder', () => {
  let saved: Session[];
  const npc = (id: string, isAlive: boolean): NPC =>
    ({ id, name: id === 'n1' ? 'Captain Vex' : 'Mara', isAlive }) as NPC;

  beforeEach(() => {
    saved = [];
    let n = 0;
    vi.mocked(window.trifold.sessions.save).mockImplementation(async (s: Session) => {
      const out = { ...s, id: s.id || `S${++n}` };
      saved.push(out);
      return out;
    });
    useCampaignStore.setState({
      current: {
        campaign: { id: 'c1' },
        sessions: [],
        scenes: [{ id: 'sc1', title: 'The old mill' }],
        encounters: [{ id: 'e1', name: 'Mill fight' }],
        npcs: [npc('n1', true), npc('n2', true)],
      } as unknown as CampaignBundle,
    });
  });

  it('records a fight, a scene going live and an NPC dying into one session', async () => {
    const off = installSessionLog();
    await recordFight(
      'e1',
      { endedAt: new Date().toISOString(), rounds: 4, xpEarned: 400, casualties: [], log: [] },
      4,
    );
    usePresenterStore.setState((s) => ({
      state: { ...s.state, scene: { kind: 'map', id: 'sc1' } as never },
    }));
    const current = useCampaignStore.getState().current!;
    useCampaignStore.setState({
      current: { ...current, npcs: [npc('n1', false), npc('n2', true)] },
    });
    await recordEvent({ kind: 'scene', at: new Date().toISOString(), sceneId: 'x', title: 'X' });
    off();

    const sessions = useCampaignStore.getState().current!.sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.events.map((e) => e.kind)).toEqual(['fight', 'scene', 'death', 'scene']);
    expect(sessions[0]!.events[0]).toMatchObject({ name: 'Mill fight', xp: 400, pcs: 4 });
    expect(sessions[0]!.events[1]).toMatchObject({ title: 'The old mill' });
    expect(sessions[0]!.events[2]).toMatchObject({ name: 'Captain Vex' });
  });

  it('writes the recap onto the session as it is, never over an event that came first', async () => {
    await recordEvent({ kind: 'scene', at: new Date().toISOString(), sceneId: 'a', title: 'A' });
    const id = useCampaignStore.getState().current!.sessions[0]!.id;
    const event = recordEvent({
      kind: 'scene',
      at: new Date().toISOString(),
      sceneId: 'b',
      title: 'B',
    });
    const recap = updateSession(id, { recap: 'They bribed the guard.' });
    await Promise.all([event, recap]);
    const final = useCampaignStore.getState().current!.sessions[0]!;
    expect(final.recap).toBe('They bribed the guard.');
    expect(final.events).toHaveLength(2);
  });
});
