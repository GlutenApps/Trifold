import { useEffect, useRef, useState } from 'react';
import type { PinnedRoll } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { usePinnedRolls, usePinnedRollsStore } from '../../stores/pinnedRollsStore';
import type { RollLogEntry } from '../../stores/rollLogStore';
import { Icon } from '../shell/icons';
import { InlineConfirm } from '../shell/InlineConfirm';

/**
 * Pinned rolls in the Dice pop-up: rolls kept from the log until they are unpinned, saved with
 * the campaign. Each shows its total, the DM's name for it, and what was rolled. A roll that has
 * just been pinned opens its name field, so naming it is one more keystroke away.
 */
export function PinnedRolls() {
  const pins = usePinnedRolls();
  const error = usePinnedRollsStore((s) => s.error);
  const clearError = usePinnedRollsStore((s) => s.clearError);
  if (pins.length === 0 && !error) return null;
  return (
    <section className="pinned-rolls">
      <h2 className="mt">Pinned</h2>
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn small" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}
      <ol className="roll-log pinned-list" aria-label="Pinned rolls">
        {pins.map((pin) => (
          <PinnedRow key={pin.id} pin={pin} />
        ))}
      </ol>
    </section>
  );
}

function PinnedRow({ pin }: { pin: PinnedRoll }) {
  const naming = usePinnedRollsStore((s) => s.naming === pin.id);
  const namingDone = usePinnedRollsStore((s) => s.namingDone);
  const rename = usePinnedRollsStore((s) => s.rename);
  const unpin = usePinnedRollsStore((s) => s.unpin);
  const [editing, setEditing] = useState(naming);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(pin.name);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (naming) {
      setEditing(true);
      namingDone();
    }
  }, [naming, namingDone]);

  useEffect(() => {
    if (!editing) return;
    setDraft(pin.name);
    input.current?.focus();
    input.current?.select();
    // Only when the field opens; typing must not reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const finish = (save: boolean) => {
    if (save) void rename(pin.id, draft);
    setEditing(false);
  };

  const rolled = new Date(pin.rolledAt);
  return (
    <li
      className={`roll-entry pinned-roll kind-${pin.kind}${confirming ? ' confirming' : ''}`}
      data-testid="pinned-roll"
    >
      <span className={`roll-total${pin.outcome ? ` ${pin.outcome}` : ''}`}>{pin.total}</span>
      <span className="roll-label">
        {editing ? (
          <input
            ref={input}
            type="text"
            aria-label={`Name for the pinned ${pin.label} roll`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finish(true);
              if (e.key === 'Escape') {
                e.stopPropagation();
                finish(false);
              }
            }}
            onBlur={() => finish(true)}
          />
        ) : (
          <span className="pinned-name">{pin.name}</span>
        )}
      </span>
      <span className="muted roll-faces">
        {pin.name !== pin.label ? `${pin.label} · ` : ''}
        {pin.faces}
        {pin.actor ? ` · ${pin.actor}` : ''}
      </span>
      <span className="muted roll-time" title={rolled.toLocaleString()}>
        {rolled.toLocaleDateString()}
      </span>
      <span className="row-actions roll-actions">
        {confirming ? (
          <InlineConfirm
            name={pin.name}
            verb="Unpin"
            onConfirm={() => {
              setConfirming(false);
              void unpin(pin.id);
            }}
            onKeep={() => setConfirming(false)}
          />
        ) : (
          <>
            <button
              type="button"
              className="chrome-btn xs"
              aria-label={`Rename ${pin.name}`}
              title="Rename"
              onClick={() => setEditing(true)}
            >
              <Icon name="pencil" />
            </button>
            <button
              type="button"
              className="chrome-btn xs"
              aria-label={`Unpin ${pin.name}`}
              aria-pressed="true"
              title="Unpin"
              onClick={() => setConfirming(true)}
            >
              <Icon name="pin" />
            </button>
          </>
        )}
      </span>
    </li>
  );
}

/** The log row's pin: pins the roll, or shows it is pinned (unpinning is the pinned row's). */
export function PinButton({ entry }: { entry: RollLogEntry }) {
  const open = useCampaignStore((s) => !!s.current);
  const pins = usePinnedRolls();
  const pinId = usePinnedRollsStore((s) => s.fromLog[entry.id]);
  const pin = usePinnedRollsStore((s) => s.pin);
  const pinned = !!pinId && pins.some((p) => p.id === pinId);
  return (
    <span className="row-actions roll-actions">
      <button
        type="button"
        className="chrome-btn xs"
        aria-label={`Pin ${entry.label}`}
        aria-pressed={pinned}
        disabled={!open}
        title={
          !open
            ? 'Open a campaign to pin rolls'
            : pinned
              ? 'Pinned: unpin it under Pinned'
              : 'Pin this roll to keep it with the campaign'
        }
        onClick={() => {
          if (!pinned) void pin(entry);
        }}
      >
        <Icon name="pin" />
      </button>
    </span>
  );
}
