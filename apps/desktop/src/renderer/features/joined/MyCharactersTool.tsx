import { useEffect, useMemo, useState } from 'react';
import type { CreatureView, TableIntent } from '@trifold/api';
import type { ConditionInstance } from '@trifold/schema';
import { AddCompanion } from '../../../web/AddCompanion';
import { HeldConditions } from '../campaign/HeldConditions';
import { HpChip, HpEditor, type HpChange } from '../campaign/HpBetweenFights';
import { Icon } from '../shell/icons';
import { InlineConfirm } from '../shell/InlineConfirm';
import { creatureKeyOf, linkText, usePlayerTable } from './PlayerTable';
import '../../../web/web.css';

/**
 * My characters (docs/PLAYER-MODE.md, "My characters and Sheets"): the player console's quick
 * view of what the player has at this table, their character first, then each companion and
 * summon. A row is built like the GM's party rows (ADR 0055): HP is a button that opens the
 * Damage / Heal / Temp HP / Set editor under it, conditions add from a plus. Nothing is changed
 * here: every change is the request a phone would send, and the row shows what the GM's table
 * says back.
 */

/** What the HP editor's change is as a request to the table (PLAYER-CONNECTOR.md, intents). */
export function hpIntent(creature: CreatureView, change: HpChange, amount: number): TableIntent {
  switch (change) {
    case 'damage':
      return { kind: 'hp', delta: -amount };
    case 'heal':
      return { kind: 'hp', delta: amount };
    case 'temp':
      return { kind: 'setTemp', value: amount };
    case 'set': {
      // Current HP travels as a change, so a GM's damage at the same moment is not undone.
      const hp = creature.hp;
      return { kind: 'hp', delta: hp ? Math.min(hp.max, amount) - hp.current : 0 };
    }
  }
}

/** The requests that turn one list of conditions into another: what the row's badges changed. */
export function conditionIntents(
  before: readonly { id: string; name: string }[],
  after: readonly { id: string; name: string; level?: number }[],
): TableIntent[] {
  const had = new Set(before.map((c) => c.id));
  const kept = new Set(after.map((c) => c.id));
  const added = after.filter((c) => !had.has(c.id));
  // Adding Exhaustion replaces the level there was: the table does that itself.
  const replaced = new Set(added.map((c) => c.name));
  return [
    ...before
      .filter((c) => !kept.has(c.id) && !replaced.has(c.name))
      .map((c): TableIntent => ({ kind: 'removeCondition', id: c.id })),
    ...added.map((c): TableIntent => ({
      kind: 'addCondition',
      name: c.name,
      ...(c.level ? { level: c.level } : {}),
    })),
  ];
}

export function MyCharactersTool() {
  const { conn, selected, select } = usePlayerTable();
  const view = conn.link === 'open' ? conn.view : null;
  const [hpOpen, setHpOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // The PC first, each followed by its companions and summons.
  const ordered = useMemo(() => {
    const mine = view?.mine ?? [];
    const out: CreatureView[] = [];
    for (const pc of mine.filter((c) => !c.companionOf)) {
      out.push(pc, ...mine.filter((c) => c.companionOf === pc.id));
    }
    for (const c of mine) if (!out.includes(c)) out.push(c);
    return out;
  }, [view?.mine]);
  const me = ordered[0];

  // Undo for Switch character lasts a few seconds (PLAYER-CONNECTOR.md, "Releasing").
  const { released, clearReleased } = conn;
  useEffect(() => {
    if (!released) return;
    const t = window.setTimeout(clearReleased, Math.max(0, released.until - Date.now()));
    return () => window.clearTimeout(t);
  }, [released, clearReleased]);

  const undo = released && (
    <div className="banner" role="status">
      <span>Released {released.names.join(', ')}</span>
      <button
        type="button"
        className="btn small"
        onClick={() => {
          conn.send({ type: 'undo' });
          clearReleased();
        }}
      >
        Undo
      </button>
    </div>
  );

  if (!view || !me) {
    return (
      <div className="my-characters">
        {undo}
        <p className="muted small my-characters-empty" role="status">
          {!view
            ? `${linkText(conn.link)}. Your characters show here when you are at the table.`
            : 'Pick your character on the VTT tab.'}
        </p>
      </div>
    );
  }

  const send = (c: CreatureView, intent: TableIntent) =>
    conn.send({ type: 'intent', creatureKind: c.kind, creatureId: c.id, intent });

  if (adding && me.kind !== 'summon') {
    const owner = { kind: me.kind, id: me.id };
    return (
      <div className="my-characters pc-host">
        <AddCompanion
          options={view.summoning?.options ?? []}
          onBack={() => setAdding(false)}
          onAdd={(option, chosen) => {
            conn.send({
              type: 'summon',
              ownerKind: owner.kind,
              ownerId: owner.id,
              optionKey: option.key,
              count: chosen.count,
              initiative: chosen.initiative,
              ...(chosen.rounds ? { rounds: chosen.rounds } : {}),
              concentration: chosen.concentration,
              persistent: chosen.persistent,
            });
            setAdding(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="my-characters" data-testid="my-characters">
      {undo}
      <ul className="my-characters-list" aria-label="My characters">
        {ordered.map((c) => {
          const key = creatureKeyOf(c);
          const companion = c !== me && (c.kind === 'summon' || !!c.companionOf);
          const conditions: ConditionInstance[] = c.conditions.map((x) => ({
            ...x,
            appliedRound: 0,
          }));
          return (
            <li
              key={key}
              className={`entity-row my-character${selected === key ? ' selected' : ''}`}
              data-testid="my-character"
            >
              <div className="row">
                <button
                  type="button"
                  className="my-character-name"
                  aria-pressed={selected === key}
                  title="Select: the VTT tab follows"
                  onClick={() => select(key)}
                >
                  {c.name}
                </button>
                {c.turn && (
                  <span className={`badge${c.turn === 'now' ? ' on' : ''}`} role="status">
                    {c.turn === 'now' ? 'Your turn' : 'You’re next'}
                  </span>
                )}
                <span className="muted small">
                  {c.summon ? `${c.summon.type} · ` : ''}AC {c.ac ?? '—'}
                  {c.movementLocked ? ' · movement locked' : ''}
                </span>
                <span className="spacer" />
                {companion &&
                  (removing === key ? (
                    <InlineConfirm
                      name={c.name}
                      verb="Remove"
                      onConfirm={() => {
                        setRemoving(null);
                        // A summon leaves play; an NPC companion goes back to the GM.
                        conn.send(
                          c.kind === 'summon'
                            ? { type: 'dismiss', tokenId: c.id }
                            : { type: 'releaseOne', creatureKind: c.kind, creatureId: c.id },
                        );
                      }}
                      onKeep={() => setRemoving(null)}
                    />
                  ) : (
                    <span className="row-actions">
                      <button
                        type="button"
                        className="chrome-btn xs danger"
                        aria-label={`Remove ${c.name}`}
                        title={c.kind === 'summon' ? 'Take out of play' : 'Give back to your GM'}
                        onClick={() => setRemoving(key)}
                      >
                        <Icon name="trash" />
                      </button>
                    </span>
                  ))}
              </div>
              <div className="status-line">
                {c.hp && c.editable.hp ? (
                  <HpChip
                    name={c.name}
                    hp={c.hp}
                    open={hpOpen === key}
                    onToggle={() => setHpOpen((k) => (k === key ? null : key))}
                  />
                ) : (
                  <span className="muted small">
                    {c.hp ? `HP ${c.hp.current}/${c.hp.max}` : 'HP not tracked'}
                  </span>
                )}
                {c.editable.conditions ? (
                  <HeldConditions
                    name={c.name}
                    conditions={conditions}
                    onChange={(next) => {
                      for (const intent of conditionIntents(c.conditions, next)) send(c, intent);
                    }}
                  />
                ) : (
                  c.conditions.map((x) => (
                    <span key={x.id} className="badge warn">
                      {x.name}
                      {x.level ? ` ${x.level}` : ''}
                    </span>
                  ))
                )}
              </div>
              {hpOpen === key && c.hp && (
                <HpEditor
                  name={c.name}
                  hp={c.hp}
                  onChange={(change, amount) => send(c, hpIntent(c, change, amount))}
                  onClose={() => setHpOpen(null)}
                />
              )}
              {c.summon?.concentrationLost && (
                <div className="banner warn" role="alert">
                  <span>Your concentration broke. Take {c.name} out of play?</span>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => conn.send({ type: 'keepSummon', tokenId: c.id })}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={() => conn.send({ type: 'dismiss', tokenId: c.id })}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="row my-characters-actions">
        {view.summoning && view.summoning.mode !== 'off' && me.kind !== 'summon' && (
          <button type="button" className="btn small" onClick={() => setAdding(true)}>
            <Icon name="plus" />
            Add a companion
          </button>
        )}
        <span className="spacer" />
        <button
          type="button"
          className="btn small"
          title="Give your character back and pick another"
          onClick={() => conn.send({ type: 'switch' })}
        >
          Switch character
        </button>
      </div>
    </div>
  );
}
