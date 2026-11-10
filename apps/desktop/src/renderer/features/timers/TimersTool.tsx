import { useEffect, useRef, useState } from 'react';
import { tvTimer } from '@trifold/rules';
import type { CampaignTimer } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useNow, useTimers, useTimersStore } from '../../stores/timersStore';
import { useTreeDnd } from '../../treeDnd';
import { Icon } from '../shell/icons';
import { TimerForm } from './TimerForm';
import { TimerRow } from './TimerRow';

/**
 * The Timers dock tool (ADR 0021): real-world countdowns, styled like Counters. New timer opens
 * a form at the top; each timer starts, pauses, resumes, resets, edits in place, deletes after
 * an inline confirm, drags to reorder, chimes or not, and can be the one timer on the TV. Any
 * number run at once. The clock is re-read four times a second while one runs; the time shown
 * always comes from the run's timestamps, so it never drifts.
 */
const flat = () => false;

export function TimersTool() {
  const campaignId = useCampaignStore((s) => s.current?.campaign.id ?? null);
  const timers = useTimers();
  const store = useTimersStore();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  const anyRunning = Object.values(store.runs).some((r) => r.status === 'running');
  const now = useNow(anyRunning);
  const onTv = tvTimer(timers);

  // Belt and braces beside the wake-ups: a redraw past a timer's end settles it too.
  useEffect(() => {
    if (anyRunning) useTimersStore.getState().settle();
  }, [now, anyRunning]);

  // Ctrl+Alt+T: focus the first timer's main button, or New timer when there are none.
  useEffect(() => {
    if (!store.pendingFocus) return;
    const first = rootRef.current?.querySelector<HTMLElement>('.timer-main');
    (first ?? newRef.current)?.focus();
    store.focusTaken();
  }, [store.pendingFocus, store]);

  useEffect(() => {
    setCreating(false);
    setEditingId(null);
  }, [campaignId]);

  const dnd = useTreeDnd<CampaignTimer>({
    items: timers,
    isFolder: flat,
    onMove: (id, _parentId, index) => void store.move(id, index),
  });

  if (!campaignId) return <p className="muted">Open a campaign first.</p>;

  return (
    <div className="counters timers" ref={rootRef}>
      {store.error && (
        <div className="banner error" role="alert">
          <span>{store.error}</span>
          <button type="button" className="btn small" onClick={store.clearError}>
            Dismiss
          </button>
        </div>
      )}
      <div className="counters-bar">
        <span className="muted small">
          {timers.length === 1 ? '1 timer' : `${timers.length} timers`}
        </span>
        <button
          ref={newRef}
          type="button"
          className="chrome-btn primary"
          aria-label="New timer"
          title="New timer"
          aria-expanded={creating}
          onClick={() => {
            setEditingId(null);
            setCreating(true);
          }}
        >
          <Icon name="plus" />
        </button>
      </div>
      {creating && (
        <TimerForm
          initial={null}
          submitLabel="Create timer"
          onCancel={() => {
            setCreating(false);
            newRef.current?.focus();
          }}
          onSubmit={(fields) => {
            setCreating(false);
            void store.create(fields).then((saved) => {
              if (!saved) return;
              requestAnimationFrame(() =>
                rootRef.current
                  ?.querySelector<HTMLElement>(`[data-timer-id="${saved.id}"] .timer-main`)
                  ?.focus(),
              );
            });
          }}
        />
      )}
      {timers.length === 0 && !creating ? (
        <p className="muted counters-empty">
          No timers yet. Give the table a real countdown: 60 seconds to decide, five minutes until
          the guards return.{' '}
          <button type="button" className="btn small" onClick={() => setCreating(true)}>
            Add your first timer
          </button>
        </p>
      ) : (
        <ul
          className={`counter-list${dnd.containerClass}`}
          aria-label="Timers"
          {...dnd.containerProps}
        >
          {timers.map((t) =>
            t.id === editingId ? (
              <li key={t.id} className="counter-row editing" data-timer-id={t.id}>
                <TimerForm
                  initial={t}
                  submitLabel="Save"
                  onCancel={() => setEditingId(null)}
                  onSubmit={(fields) => {
                    setEditingId(null);
                    void store.edit(t.id, fields);
                  }}
                />
              </li>
            ) : (
              <TimerRow
                key={t.id}
                timer={t}
                run={store.runOf(t)}
                now={now}
                onStart={() => store.start(t.id)}
                onPause={() => store.pause(t.id)}
                onReset={() => store.reset(t.id)}
                onEdit={() => {
                  setCreating(false);
                  setEditingId(t.id);
                }}
                onDelete={() => void store.remove(t.id)}
                onToggleTv={() => void store.setShowOnTv(t.id, !t.showOnTv)}
                onToggleChime={() => void store.setChime(t.id, !t.chime)}
                tvTakenBy={onTv && onTv.id !== t.id ? onTv.name : null}
                dragProps={dnd.rowProps(t)}
                dragClass={dnd.rowClass(t)}
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}
