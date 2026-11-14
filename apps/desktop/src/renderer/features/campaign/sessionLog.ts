import type { EncounterResult, Session, SessionEvent } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { usePresenterStore } from '../../stores/presenterStore';

/**
 * The session log (DESIGN.md §6.3, Beta 10, ADR 0040). The first thing that happens at the table
 * (a fight ends, a scene goes on the TV, an NPC dies) opens a session, and everything after joins
 * it while play goes on: a session takes new events until it has been quiet for SESSION_GAP_MS,
 * so a game that runs past midnight stays one session. The pure helpers come first; the recorder
 * at the end writes through the campaign store, one event at a time.
 */

/** How long a session waits for more before the next event starts a new one. */
export const SESSION_GAP_MS = 6 * 60 * 60 * 1000;

/** The session still taking events at `now`, if any: the most recently active one, if recent. */
export function openSession(sessions: readonly Session[], now: string): Session | null {
  let latest: Session | null = null;
  for (const s of sessions) if (!latest || s.lastActivityAt > latest.lastActivityAt) latest = s;
  if (!latest) return null;
  return Date.parse(now) - Date.parse(latest.lastActivityAt) < SESSION_GAP_MS ? latest : null;
}

/** A session not yet written (main gives it an id). */
export function blankSession(now: string): Session {
  return {
    schemaVersion: 1,
    id: '',
    title: '',
    recap: '',
    events: [],
    startedAt: now,
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The session with an event added, or a new session holding it. A scene shown again, or a death
 * already noted, adds nothing but keeps the session open.
 */
export function withEvent(session: Session | null, event: SessionEvent): Session {
  const base = session ?? blankSession(event.at);
  const repeat = base.events.some(
    (e) =>
      (event.kind === 'scene' && e.kind === 'scene' && e.sceneId === event.sceneId) ||
      (event.kind === 'death' && e.kind === 'death' && e.npcId === event.npcId),
  );
  return {
    ...base,
    events: repeat ? base.events : [...base.events, event],
    lastActivityAt: event.at > base.lastActivityAt ? event.at : base.lastActivityAt,
  };
}

/** XP in a session: the fights' total, and each PC's share (a fight's XP split among its PCs). */
export function sessionXp(session: Pick<Session, 'events'>): { xp: number; perPc: number } {
  let xp = 0;
  let perPc = 0;
  for (const e of session.events) {
    if (e.kind !== 'fight') continue;
    xp += e.xp;
    if (e.pcs > 0) perPc += e.xp / e.pcs;
  }
  return { xp, perPc: Math.floor(perPc) };
}

/** The campaign's XP across every session. */
export function campaignXp(sessions: readonly Pick<Session, 'events'>[]): {
  xp: number;
  perPc: number;
} {
  return sessions.reduce(
    (sum, s) => {
      const one = sessionXp(s);
      return { xp: sum.xp + one.xp, perPc: sum.perPc + one.perPc };
    },
    { xp: 0, perPc: 0 },
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "2 fights · 450 XP · 3 scenes · 1 death", for a folded session. */
export function sessionSummary(session: Pick<Session, 'events'>): string {
  const count = (kind: SessionEvent['kind']) =>
    session.events.filter((e) => e.kind === kind).length;
  const fights = count('fight');
  const parts = [
    fights ? plural(fights, 'fight') : '',
    fights ? `${sessionXp(session).xp.toLocaleString()} XP` : '',
    count('scene') ? plural(count('scene'), 'scene') : '',
    count('death') ? plural(count('death'), 'death') : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Nothing recorded yet';
}

/** "Session 3": a session's place counting from the first, for one without a title. */
export function sessionName(sessions: readonly Session[], session: Session): string {
  if (session.title.trim()) return session.title.trim();
  const order = [...sessions].sort(
    (a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id),
  );
  const index = order.findIndex((s) => s.id === session.id);
  return `Session ${index >= 0 ? index + 1 : order.length + 1}`;
}

// ---------- the recorder ----------

let chain: Promise<unknown> = Promise.resolve();

/**
 * The log never breaks what it watches: a write that fails is reported (the campaign store shows
 * its own errors as a banner) and the fight or scene that caused it carries on.
 */
function settle(p: Promise<unknown>): Promise<void> {
  return p.then(
    () => undefined,
    (err: unknown) => console.error('session log:', err),
  );
}

/** Adds an event to the open session (or starts one). Writes go one after another. */
export function recordEvent(event: SessionEvent): Promise<void> {
  const next = chain.then(async () => {
    const store = useCampaignStore.getState();
    if (!store.current) return;
    const open = openSession(store.current.sessions, event.at);
    const updated = withEvent(open, event);
    if (open && updated.events === open.events && updated.lastActivityAt === open.lastActivityAt)
      return;
    await store.saveSession(updated);
  });
  chain = next.catch(() => undefined);
  return settle(next);
}

/**
 * The DM's title and recap, written in the same queue as recorded events and onto the session as
 * it is then, so an event arriving while the recap is typed is never lost, nor the recap.
 */
export function updateSession(
  sessionId: string,
  patch: Partial<Pick<Session, 'title' | 'recap'>>,
): Promise<void> {
  const next = chain.then(async () => {
    const store = useCampaignStore.getState();
    const session = store.current?.sessions.find((s) => s.id === sessionId);
    if (session) await store.saveSession({ ...session, ...patch });
  });
  chain = next.catch(() => undefined);
  return settle(next);
}

/** A session started by hand (New session), before anything has happened. */
export function startSession(): Promise<void> {
  const next = chain.then(async () => {
    await useCampaignStore.getState().saveSession(blankSession(new Date().toISOString()));
  });
  chain = next.catch(() => undefined);
  return settle(next);
}

/** A fight that just ended, from its result and the PCs who took part. */
export function recordFight(
  encounterId: string,
  result: EncounterResult,
  pcs: number,
): Promise<void> {
  const name =
    useCampaignStore.getState().current?.encounters.find((e) => e.id === encounterId)?.name ??
    'Encounter';
  return recordEvent({
    kind: 'fight',
    at: result.endedAt,
    encounterId,
    name,
    xp: result.xpEarned,
    rounds: result.rounds,
    casualties: result.casualties,
    pcs,
  });
}

/**
 * Watches the console for the rest: a scene going on the TV, and a named NPC going from alive to
 * dead (in a fight, once its result is read back, or by hand in its form). Returns the unsubscribe.
 */
export function installSessionLog(): () => void {
  const offScene = usePresenterStore.subscribe((s, prev) => {
    const live = s.state.scene;
    if (!live || live.id === prev.state.scene?.id) return;
    const scene = useCampaignStore.getState().current?.scenes.find((x) => x.id === live.id);
    if (!scene) return;
    void recordEvent({
      kind: 'scene',
      at: new Date().toISOString(),
      sceneId: scene.id,
      title: scene.title,
    });
  });
  const offDeaths = useCampaignStore.subscribe((s, prev) => {
    const now = s.current;
    const before = prev.current;
    if (!now || !before || now.campaign.id !== before.campaign.id || now.npcs === before.npcs)
      return;
    const wasAlive = new Set(before.npcs.filter((n) => n.isAlive).map((n) => n.id));
    for (const npc of now.npcs) {
      if (npc.isAlive || !wasAlive.has(npc.id)) continue;
      void recordEvent({
        kind: 'death',
        at: new Date().toISOString(),
        npcId: npc.id,
        name: npc.name,
      });
    }
  });
  return () => {
    offScene();
    offDeaths();
  };
}
