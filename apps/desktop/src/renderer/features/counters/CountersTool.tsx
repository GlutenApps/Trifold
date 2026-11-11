import { useEffect, useRef, useState } from 'react';
import { canShowOnTv, draftOf, EMPTY_COUNTER_DRAFT, type CounterChange } from '@trifold/rules';
import type { CampaignCounter } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCounters, useCountersStore } from '../../stores/countersStore';
import { useTreeDnd } from '../../treeDnd';
import { Icon } from '../shell/icons';
import { CounterForm } from './CounterForm';
import { CounterRow, type CounterFlash } from './CounterRow';

/**
 * The Counters dock tool (ADR 0019): small numbers the DM tracks at the table, kept with the
 * campaign. New counter opens a form at the top; each counter adjusts by 1 or its step, takes a
 * typed value, resets, edits in place, deletes after an inline confirm and drags to reorder.
 * A change that runs into a bound flashes the value; a counter sitting on one stays marked.
 */
const FLASH_MS = 700;
const flat = () => false;

export function CountersTool() {
  const campaignId = useCampaignStore((s) => s.current?.campaign.id ?? null);
  const counters = useCounters();
  const store = useCountersStore();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<(CounterFlash & { id: string }) | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  const flashes = useRef(0);

  const dnd = useTreeDnd<CampaignCounter>({
    items: counters,
    isFolder: flat,
    onMove: (id, _parentId, index) => void store.move(id, index),
  });

  // Ctrl+Alt+C: focus the first counter, or New counter when there are none.
  useEffect(() => {
    if (!store.pendingFocus) return;
    const first = rootRef.current?.querySelector<HTMLElement>('.counter-value');
    (first ?? newRef.current)?.focus();
    store.focusTaken();
  }, [store.pendingFocus, store]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

  // A different campaign closes any open form.
  useEffect(() => {
    setCreating(false);
    setEditingId(null);
  }, [campaignId]);

  if (!campaignId) return <p className="muted">Open a campaign first.</p>;

  const show = (id: string, change: CounterChange | null) => {
    if (change?.hit) setFlash({ id, bound: change.hit, n: (flashes.current += 1) });
  };

  return (
    <div className="counters" ref={rootRef}>
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
          {counters.length === 1 ? '1 counter' : `${counters.length} counters`}
        </span>
        <button
          ref={newRef}
          type="button"
          className="chrome-btn primary"
          aria-label="New counter"
          title="New counter"
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
        <CounterForm
          initial={EMPTY_COUNTER_DRAFT}
          submitLabel="Create counter"
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
                  ?.querySelector<HTMLElement>(`[data-counter-id="${saved.id}"] .counter-value`)
                  ?.focus(),
              );
            });
          }}
        />
      )}
      {counters.length === 0 && !creating ? (
        <p className="muted counters-empty">
          No counters yet. Track rounds until a ritual completes, legendary resistances, torches or
          waves of enemies. Use + above to add one.
        </p>
      ) : (
        <ul
          className={`counter-list${dnd.containerClass}`}
          aria-label="Counters"
          {...dnd.containerProps}
        >
          {counters.map((c) =>
            c.id === editingId ? (
              <li key={c.id} className="counter-row editing" data-counter-id={c.id}>
                <CounterForm
                  initial={draftOf(c)}
                  submitLabel="Save"
                  onCancel={() => setEditingId(null)}
                  onSubmit={(fields) => {
                    setEditingId(null);
                    void store.edit(c.id, fields);
                  }}
                />
              </li>
            ) : (
              <CounterRow
                key={c.id}
                counter={c}
                flash={flash?.id === c.id ? flash : null}
                onAdjust={(delta) => show(c.id, store.adjust(c.id, delta))}
                onSet={(value) => show(c.id, store.setValue(c.id, value))}
                onReset={() => show(c.id, store.reset(c.id))}
                onEdit={() => {
                  setCreating(false);
                  setEditingId(c.id);
                }}
                onDelete={() => void store.remove(c.id)}
                onToggleTv={() => void store.setShowOnTv(c.id, !c.showOnTv)}
                canShowOnTv={canShowOnTv(counters, c.id)}
                dragProps={{ ...dnd.rowProps(c), 'data-counter-id': c.id }}
                dragClass={dnd.rowClass(c)}
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}
