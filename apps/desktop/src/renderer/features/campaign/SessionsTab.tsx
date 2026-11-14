import { useEffect, useRef, useState } from 'react';
import type { Session, SessionEvent } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { flushSave, scheduleSave } from '../../stores/pendingSaves';
import { InlineConfirm } from '../shell/InlineConfirm';
import { Icon } from '../shell/icons';
import { NoteEditor } from './NoteEditor';
import {
  campaignXp,
  sessionName,
  sessionSummary,
  sessionXp,
  startSession,
  updateSession,
} from './sessionLog';

/**
 * The Campaign tab's Sessions sub-tab (DESIGN.md §6.3, ADR 0040): the campaign's XP so far, then
 * each session newest first, the newest open. A session lists its fights, the scenes shown and
 * the NPCs who died, all recorded as they happened, and the DM's recap, autosaved like a note.
 */
const NO_SESSIONS: Session[] = [];
const AUTOSAVE_MS = 600;
const slot = (id: string) => `session:${id}`;

const fmt = (n: number) => n.toLocaleString();

function sessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function SessionsTab() {
  const sessions = useCampaignStore((s) => s.current?.sessions ?? NO_SESSIONS);
  // The newest session starts open; the rest show one summary line until opened.
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [closedIds, setClosedIds] = useState<Set<string>>(() => new Set());
  const total = campaignXp(sessions);
  const newestId = sessions[0]?.id;
  const isOpen = (id: string) => openIds.has(id) || (id === newestId && !closedIds.has(id));
  const toggle = (id: string) => {
    const open = isOpen(id);
    setOpenIds((s) => {
      const next = new Set(s);
      if (open) next.delete(id);
      else next.add(id);
      return next;
    });
    setClosedIds((s) => {
      const next = new Set(s);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <div className="sessions">
      <div className="row sessions-head">
        <span className="sessions-total" data-testid="campaign-xp">
          Campaign XP <strong>{fmt(total.xp)}</strong>
          {total.perPc > 0 && <span className="muted"> · {fmt(total.perPc)} per PC</span>}
        </span>
        <span className="spacer" />
        <button
          type="button"
          className="chrome-btn primary"
          aria-label="New session"
          title="Start a session now. One also starts on its own when a fight ends or a scene goes on the TV."
          onClick={() => void startSession()}
        >
          <Icon name="plus" />
        </button>
      </div>
      {sessions.length === 0 ? (
        <p className="muted">
          No sessions yet. The first fight that ends or scene that goes on the TV starts one, and
          everything after it joins until play stops for six hours. Press + to start one now.
        </p>
      ) : (
        <ul className="session-list">
          {sessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              name={sessionName(sessions, s)}
              open={isOpen(s.id)}
              onToggle={() => toggle(s.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionCard({
  session,
  name,
  open,
  onToggle,
}: {
  session: Session;
  name: string;
  open: boolean;
  onToggle(): void;
}) {
  const removeSession = useCampaignStore((s) => s.removeSession);
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState(session.title);
  const fights = session.events.filter(
    (e): e is Extract<SessionEvent, { kind: 'fight' }> => e.kind === 'fight',
  );
  const scenes = session.events.filter(
    (e): e is Extract<SessionEvent, { kind: 'scene' }> => e.kind === 'scene',
  );
  const deaths = session.events.filter(
    (e): e is Extract<SessionEvent, { kind: 'death' }> => e.kind === 'death',
  );
  const xp = sessionXp(session);

  // Typing lands a moment later; closing the card or leaving the tab lands it at once. Title and
  // recap edits made in the same moment go together.
  const pending = useRef<{ title?: string; recap?: string }>({});
  const edit = (patch: { title?: string; recap?: string }) => {
    pending.current = { ...pending.current, ...patch };
    scheduleSave(
      slot(session.id),
      () => {
        const next = pending.current;
        pending.current = {};
        return updateSession(session.id, next);
      },
      AUTOSAVE_MS,
    );
  };
  useEffect(() => () => void flushSave(slot(session.id)), [session.id]);

  return (
    <li className="session-card" data-testid="session-card">
      <div className="session-card-head">
        <button
          type="button"
          className="session-toggle"
          aria-expanded={open}
          onClick={onToggle}
          title={open ? 'Fold this session' : 'Open this session'}
        >
          <Icon name={open ? 'down' : 'right'} />
          <span className="session-name">{name}</span>
          <span className="muted small">{sessionDate(session.startedAt)}</span>
        </button>
        {!open && <span className="muted small session-summary">{sessionSummary(session)}</span>}
        <span className="spacer" />
        {confirming ? (
          <InlineConfirm
            name={name}
            question={`Delete ${name} and its recap? The fights stay in their encounters.`}
            onConfirm={() => {
              setConfirming(false);
              void removeSession(session.id);
            }}
            onKeep={() => setConfirming(false)}
          />
        ) : (
          <span className="row-actions">
            <button
              type="button"
              className="chrome-btn xs danger"
              aria-label={`Delete ${name}`}
              title="Delete"
              onClick={() => setConfirming(true)}
            >
              <Icon name="trash" />
            </button>
          </span>
        )}
      </div>

      {open && (
        <div className="session-body">
          <label className="field">
            Title
            <input
              type="text"
              value={title}
              placeholder={name}
              onChange={(e) => {
                setTitle(e.target.value);
                edit({ title: e.target.value });
              }}
            />
          </label>

          <section className="session-section" aria-label="Fights">
            <h3>
              Fights
              {fights.length > 0 && (
                <span className="muted small">
                  {' '}
                  · {fmt(xp.xp)} XP{xp.perPc > 0 ? ` · ${fmt(xp.perPc)} per PC` : ''}
                </span>
              )}
            </h3>
            {fights.length === 0 ? (
              <p className="muted small">No fights yet.</p>
            ) : (
              <ul className="session-events">
                {fights.map((f, i) => (
                  <li key={i}>
                    <strong>{f.name}</strong>{' '}
                    <span className="muted">
                      {fmt(f.xp)} XP
                      {f.pcs > 0 ? ` (${fmt(Math.floor(f.xp / f.pcs))} per PC)` : ''} · {f.rounds}{' '}
                      {f.rounds === 1 ? 'round' : 'rounds'}
                      {f.casualties.length ? ` · fell: ${f.casualties.join(', ')}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="session-section" aria-label="Scenes shown">
            <h3>Scenes shown</h3>
            {scenes.length === 0 ? (
              <p className="muted small">Nothing went on the TV.</p>
            ) : (
              <p className="session-scenes">{scenes.map((s) => s.title).join(' · ')}</p>
            )}
          </section>

          {deaths.length > 0 && (
            <section className="session-section" aria-label="Deaths">
              <h3>Died</h3>
              <p className="session-scenes">{deaths.map((d) => d.name).join(', ')}</p>
            </section>
          )}

          <section className="session-section session-recap" aria-label="Recap">
            <h3>Recap</h3>
            <NoteEditor markdown={session.recap} onChange={(recap) => edit({ recap })} />
          </section>
        </div>
      )}
    </li>
  );
}
