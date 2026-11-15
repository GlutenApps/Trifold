import { useState } from 'react';
import { CONDITION_NAMES } from '@trifold/rules';
import type { CreatureView, TableIntent } from '@trifold/api';
import type { Connection } from './connection';
import { Portrait } from './Portrait';

/**
 * A player's character on the phone (Phase 2): HP, temp HP, max HP, AC and conditions, which the
 * player can change, and the initiative box while a fight waits for it. HP and temp HP are sent
 * as changes ("−7", "+5") so the DM's damage and the player's healing both count; max HP and AC
 * are numbers. The next view from the DM's Trifold is always the truth.
 */
export function Stats({ creature, conn }: { creature: CreatureView; conn: Connection }) {
  const [amount, setAmount] = useState('');
  const [editing, setEditing] = useState<'maxHp' | 'ac' | null>(null);
  const [draft, setDraft] = useState('');
  const send = (intent: TableIntent) =>
    conn.send({ type: 'intent', creatureKind: creature.kind, creatureId: creature.id, intent });

  const hp = creature.hp;
  const ratio = hp && hp.max > 0 ? Math.max(0, Math.min(1, hp.current / hp.max)) : null;
  const band =
    ratio === null ? '' : hp!.current <= 0 ? 'down' : ratio <= 0.5 ? 'bloodied' : 'healthy';
  const n = Number(amount);
  const amountOk = /^\d{1,3}$/.test(amount) && n > 0;
  const change = (kind: 'hp' | 'temp', sign: 1 | -1) => {
    if (!amountOk) return;
    send({ kind, delta: sign * n });
    setAmount('');
  };

  const startEdit = (field: 'maxHp' | 'ac') => {
    setEditing(field);
    setDraft(String(field === 'ac' ? (creature.ac ?? '') : (hp?.max ?? '')));
  };
  const saveEdit = () => {
    const value = Number(draft);
    if (editing && /^\d{1,3}$/.test(draft)) send({ kind: editing, value });
    setEditing(null);
  };

  return (
    <section className="pc-stats" aria-label={`${creature.name}’s numbers`}>
      <div className="pc-stats-head">
        <Portrait url={creature.portraitUrl} name={creature.name} size={40} />
        <h2>{creature.name}</h2>
      </div>
      {creature.movementLocked && creature.tokenId && (
        <span className="pc-locked" role="status">
          Movement locked by the DM
        </span>
      )}

      {creature.needsInitiative && (
        <InitiativeBox onSubmit={(value) => send({ kind: 'initiative', value })} />
      )}

      <dl className="pc-stat-row">
        <div className={`pc-stat hp ${band}`}>
          <dt>HP</dt>
          <dd>
            {hp ? (
              <>
                <span className="pc-num">{hp.current}</span>
                <span className="pc-of">/ {hp.max}</span>
              </>
            ) : (
              '—'
            )}
          </dd>
          {ratio !== null && (
            <span className="pc-bar" aria-hidden="true">
              <span style={{ width: `${ratio * 100}%` }} />
            </span>
          )}
        </div>
        <div className="pc-stat">
          <dt>Temp</dt>
          <dd className="pc-num">{hp ? hp.temp : '—'}</dd>
        </div>
        <StatButton
          label="AC"
          value={creature.ac}
          editable={creature.editable.ac}
          onEdit={() => startEdit('ac')}
        />
      </dl>

      {creature.editable.hp && hp && (
        <div className="pc-change" role="group" aria-label="Change HP">
          <input
            className="pc-amount"
            inputMode="numeric"
            pattern="\d*"
            maxLength={3}
            placeholder="0"
            aria-label="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 3))}
          />
          <button
            type="button"
            className="pc-btn danger"
            disabled={!amountOk}
            onClick={() => change('hp', -1)}
          >
            Damage
          </button>
          <button
            type="button"
            className="pc-btn ok"
            disabled={!amountOk}
            onClick={() => change('hp', 1)}
          >
            Heal
          </button>
          <button
            type="button"
            className="pc-btn"
            disabled={!amountOk}
            aria-label="Add temp HP"
            onClick={() => change('temp', 1)}
          >
            +Temp
          </button>
          <button
            type="button"
            className="pc-btn"
            disabled={!amountOk || !hp.temp}
            aria-label="Remove temp HP"
            onClick={() => change('temp', -1)}
          >
            −Temp
          </button>
        </div>
      )}

      {creature.editable.maxHp && hp && editing !== 'maxHp' && (
        <button type="button" className="pc-link-btn" onClick={() => startEdit('maxHp')}>
          Change max HP ({hp.max})
        </button>
      )}

      {editing && (
        <form
          className="pc-edit"
          onSubmit={(e) => {
            e.preventDefault();
            saveEdit();
          }}
        >
          <label className="pc-field">
            <span>{editing === 'ac' ? 'AC' : 'Max HP'}</span>
            <input
              inputMode="numeric"
              maxLength={3}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 3))}
            />
          </label>
          <button type="button" className="pc-btn" onClick={() => setEditing(null)}>
            Cancel
          </button>
          <button type="submit" className="pc-btn primary" disabled={!/^\d{1,3}$/.test(draft)}>
            Save
          </button>
        </form>
      )}

      <Conditions creature={creature} send={send} />
    </section>
  );
}

function StatButton({
  label,
  value,
  editable,
  onEdit,
}: {
  label: string;
  value: number | null;
  editable: boolean;
  onEdit(): void;
}) {
  const body = (
    <>
      <dt>{label}</dt>
      <dd className="pc-num">{value ?? '—'}</dd>
    </>
  );
  if (!editable) return <div className="pc-stat">{body}</div>;
  return (
    <div className="pc-stat">
      <button
        type="button"
        className="pc-stat-edit"
        aria-label={`Change ${label}`}
        onClick={onEdit}
      >
        {body}
      </button>
    </div>
  );
}

function InitiativeBox({ onSubmit }: { onSubmit(value: number): void }) {
  const [value, setValue] = useState('');
  const ok = /^-?\d{1,2}$/.test(value);
  return (
    <form
      className="pc-initiative"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSubmit(Number(value));
      }}
    >
      <label className="pc-field">
        <span>Roll initiative and enter what you got</span>
        <input
          inputMode="numeric"
          maxLength={3}
          aria-label="Initiative"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d-]/g, '').slice(0, 3))}
        />
      </label>
      <button type="submit" className="pc-btn primary" disabled={!ok}>
        Submit
      </button>
    </form>
  );
}

function Conditions({
  creature,
  send,
}: {
  creature: CreatureView;
  send(intent: TableIntent): void;
}) {
  const [adding, setAdding] = useState('');
  const [level, setLevel] = useState('1');
  if (!creature.editable.conditions) {
    return (
      <div className="pc-conditions">
        <span className="pc-hint">Conditions are tracked during fights.</span>
      </div>
    );
  }
  return (
    <div className="pc-conditions-edit">
      <div className="pc-conditions">
        {creature.conditions.length ? (
          creature.conditions.map((c) => (
            <button
              key={c.id}
              type="button"
              className="pc-tag removable"
              aria-label={`Remove ${c.name}${c.level ? ` ${c.level}` : ''}`}
              onClick={() => send({ kind: 'removeCondition', id: c.id })}
            >
              {c.name}
              {c.level ? ` ${c.level}` : ''}
              <span aria-hidden="true">×</span>
            </button>
          ))
        ) : (
          <span className="pc-hint">No conditions</span>
        )}
      </div>
      <form
        className="pc-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!adding) return;
          send({
            kind: 'addCondition',
            name: adding,
            ...(adding === 'Exhaustion' ? { level: Number(level) } : {}),
          });
          setAdding('');
        }}
      >
        <select
          aria-label="Add a condition"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
        >
          <option value="">Add a condition…</option>
          {CONDITION_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {adding === 'Exhaustion' && (
          <select
            aria-label="Exhaustion level"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            {[1, 2, 3, 4, 5, 6].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className="pc-btn" disabled={!adding}>
          Add
        </button>
      </form>
    </div>
  );
}
