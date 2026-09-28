import { useState } from 'react';
import type { Combatant, ConditionDuration } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore, type PendingDamage } from '../../stores/combatStore';
import { StatBlock } from '../compendium/StatBlock';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { useUiStore } from '../../stores/uiStore';

const CONDITIONS = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Exhaustion',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
  'Concentrating',
  'Surprised',
  'Hidden',
];
const DAMAGE_TYPES = [
  '',
  'bludgeoning',
  'piercing',
  'slashing',
  'acid',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'poison',
  'psychic',
  'radiant',
  'thunder',
];

function hpClass(c: Combatant): string {
  if (c.dead) return 'hp dead';
  if (c.hp.max > 0 && c.hp.current <= c.hp.max / 2) return 'hp bloodied';
  return 'hp';
}

function CombatantRow({
  c,
  active,
  selected,
}: {
  c: Combatant;
  active: boolean;
  selected: boolean;
}) {
  const select = useCombatStore((s) => s.select);
  const setInitiative = useCombatStore((s) => s.setInitiative);
  const rollInit = useCombatStore((s) => s.rollInitiativeFor);
  const move = useCombatStore((s) => s.move);
  return (
    <div
      className={`combatant-row role-${c.role}${active ? ' active' : ''}${selected ? ' selected' : ''}${c.dead ? ' dead' : ''}${c.held ? ' held' : ''}`}
      data-testid="combatant-row"
      onClick={() => select(c.id)}
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') select(c.id);
      }}
    >
      <span className="init">
        <input
          type="number"
          aria-label={`Initiative for ${c.name}`}
          className="narrow"
          value={c.initiative ?? ''}
          placeholder="—"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            setInitiative(c.id, e.target.value === '' ? null : Number(e.target.value))
          }
        />
        {c.initiative === null && !c.isLair && (
          <button
            type="button"
            className="btn tiny"
            title="Roll initiative"
            onClick={(e) => {
              e.stopPropagation();
              rollInit(c.id);
            }}
          >
            roll
          </button>
        )}
      </span>
      <span className="name">
        {c.name}
        {c.hidden && <span className="badge">hidden</span>}
        {!c.revealed && c.ref.kind !== 'pc' && !c.isLair && (
          <span className="badge" title="Players see this name">
            {c.maskedName}
          </span>
        )}
        {c.held && <span className="badge">holding</span>}
        {c.concentrating && <span className="badge save">conc: {c.concentrating.on}</span>}
        {c.conditions.map((k) => (
          <span key={k.id} className="badge warn">
            {k.name}
            {k.level ? ` ${k.level}` : ''}
          </span>
        ))}
      </span>
      {!c.isLair && (
        <span className={hpClass(c)}>
          {c.dead ? 'dead' : `${c.hp.current}/${c.hp.max}`}
          {c.hp.temp > 0 ? ` +${c.hp.temp}` : ''}
          {c.deathSaves ? ` ☑${c.deathSaves.successes} ☒${c.deathSaves.failures}` : ''}
        </span>
      )}
      <span className="reorder">
        <button
          type="button"
          className="btn tiny"
          title="Move up"
          onClick={(e) => {
            e.stopPropagation();
            move(c.id, -1);
          }}
        >
          ▲
        </button>
        <button
          type="button"
          className="btn tiny"
          title="Move down"
          onClick={(e) => {
            e.stopPropagation();
            move(c.id, 1);
          }}
        >
          ▼
        </button>
      </span>
    </div>
  );
}

function Inspector({ c }: { c: Combatant }) {
  const store = useCombatStore();
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('');
  const [condition, setCondition] = useState('Frightened');
  const [durationKind, setDurationKind] = useState<
    'none' | 'rounds' | 'untilStartOfTurn' | 'untilEndOfTurn' | 'untilSave'
  >('none');
  const [rounds, setRounds] = useState('1');
  const [saveAbility, setSaveAbility] = useState('con');
  const [saveDc, setSaveDc] = useState('13');
  const [concentrationOn, setConcentrationOn] = useState('');
  const n = Number.parseInt(amount, 10);
  const valid = Number.isFinite(n) && n > 0;

  const duration = (): ConditionDuration | undefined => {
    switch (durationKind) {
      case 'rounds':
        return { kind: 'rounds', remaining: Math.max(1, Number(rounds) || 1) };
      case 'untilStartOfTurn':
      case 'untilEndOfTurn':
        return {
          kind: durationKind,
          combatantId: store.state?.combatants[store.state.turnIndex]?.id ?? c.id,
        };
      case 'untilSave':
        return {
          kind: 'untilSave',
          ability: saveAbility as ConditionDuration extends { ability: infer A } ? A : never,
          dc: Number(saveDc) || 10,
        };
      default:
        return undefined;
    }
  };

  return (
    <div className="card inspector-card">
      <div className="row">
        <h2>{c.name}</h2>
        <span className="muted">
          {c.ac !== undefined ? `AC ${c.ac} · ` : ''}init {c.initiativeBonus >= 0 ? '+' : ''}
          {c.initiativeBonus}
        </span>
        <span className="spacer" />
        {!c.revealed && c.ref.kind !== 'pc' && (
          <button type="button" className="btn" onClick={() => store.reveal(c.id)}>
            Reveal name
          </button>
        )}
        <button type="button" className="btn" onClick={() => store.toggleHidden(c.id)}>
          {c.hidden ? 'Unhide' : 'Hide'}
        </button>
        <button type="button" className="btn" onClick={() => store.toggleHeld(c.id)}>
          {c.held ? 'Release' : 'Hold'}
        </button>
        <button type="button" className="btn" onClick={() => store.markDead(c.id, !c.dead)}>
          {c.dead ? 'Revive' : 'Mark dead'}
        </button>
        <button type="button" className="btn" onClick={() => store.remove(c.id)}>
          Remove
        </button>
      </div>

      {!c.isLair && (
        <div className="row">
          <input
            type="number"
            aria-label="Amount"
            className="narrow"
            placeholder="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <select aria-label="Damage type" value={type} onChange={(e) => setType(e.target.value)}>
            {DAMAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t || 'any type'}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn primary"
            disabled={!valid}
            onClick={() => {
              store.damage(c.id, n, type || undefined);
              setAmount('');
            }}
          >
            Damage
          </button>
          <button
            type="button"
            className="btn"
            disabled={!valid}
            onClick={() => {
              store.heal(c.id, n);
              setAmount('');
            }}
          >
            Heal
          </button>
          <button
            type="button"
            className="btn"
            disabled={!valid}
            onClick={() => {
              store.tempHp(c.id, n);
              setAmount('');
            }}
          >
            Temp HP
          </button>
          {c.deathSaves && (
            <button type="button" className="btn" onClick={() => store.deathSave(c.id)}>
              Death save
            </button>
          )}
        </div>
      )}

      <div className="row">
        <select
          aria-label="Condition"
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
        >
          {CONDITIONS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select
          aria-label="Duration"
          value={durationKind}
          onChange={(e) => setDurationKind(e.target.value as typeof durationKind)}
        >
          <option value="none">no duration</option>
          <option value="rounds">rounds</option>
          <option value="untilStartOfTurn">until start of active turn</option>
          <option value="untilEndOfTurn">until end of active turn</option>
          <option value="untilSave">until save</option>
        </select>
        {durationKind === 'rounds' && (
          <input
            type="number"
            className="narrow"
            aria-label="Rounds"
            value={rounds}
            onChange={(e) => setRounds(e.target.value)}
          />
        )}
        {durationKind === 'untilSave' && (
          <>
            <select
              aria-label="Save ability"
              value={saveAbility}
              onChange={(e) => setSaveAbility(e.target.value)}
            >
              {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((a) => (
                <option key={a} value={a}>
                  {a.toUpperCase()}
                </option>
              ))}
            </select>
            <input
              type="number"
              className="narrow"
              aria-label="Save DC"
              value={saveDc}
              onChange={(e) => setSaveDc(e.target.value)}
            />
          </>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => {
            const level =
              condition === 'Exhaustion'
                ? (c.conditions.find((k) => k.name === 'Exhaustion')?.level ?? 0) + 1
                : undefined;
            store.addCondition(
              c.id,
              condition,
              duration(),
              level && level <= 6 ? level : undefined,
            );
          }}
        >
          Add condition
        </button>
      </div>
      {c.conditions.length > 0 && (
        <div className="row">
          {c.conditions.map((k) => (
            <button
              key={k.id}
              type="button"
              className="badge warn clickable"
              title="Remove"
              onClick={() => store.removeCondition(c.id, k.id)}
            >
              {k.name}
              {k.level ? ` ${k.level}` : ''} ×
            </button>
          ))}
        </div>
      )}

      <div className="row">
        {c.concentrating ? (
          <button type="button" className="btn" onClick={() => store.setConcentration(c.id, null)}>
            Stop concentrating on {c.concentrating.on}
          </button>
        ) : (
          <>
            <input
              type="text"
              aria-label="Concentrating on"
              placeholder="concentrating on…"
              value={concentrationOn}
              onChange={(e) => setConcentrationOn(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              disabled={!concentrationOn.trim()}
              onClick={() => {
                store.setConcentration(c.id, concentrationOn.trim());
                setConcentrationOn('');
              }}
            >
              Concentrate
            </button>
          </>
        )}
      </div>

      {(c.counters.length > 0 || c.recharges.length > 0) && (
        <div className="row counters">
          {c.counters.map((k) => (
            <span key={k.id} className="counter">
              {k.name} {k.current}/{k.max}
              <button
                type="button"
                className="btn tiny"
                onClick={() => store.useCounter(c.id, k.id, -1)}
              >
                −
              </button>
              <button
                type="button"
                className="btn tiny"
                onClick={() => store.useCounter(c.id, k.id, 1)}
              >
                +
              </button>
            </span>
          ))}
          {c.recharges.map((r) => (
            <span key={r.id} className={`counter${r.available ? '' : ' spent'}`}>
              {r.featureName}: {r.available ? 'ready' : `recharges on ${r.min}+`}
              {r.available && (
                <button
                  type="button"
                  className="btn tiny"
                  onClick={() => store.spendRecharge(c.id, r.id)}
                >
                  use
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PendingDamagePanel() {
  const pending = useCombatStore((s) => s.pendingDamage);
  const combatants = useCombatStore((s) => s.state?.combatants ?? []);
  const selectedId = useCombatStore((s) => s.selectedId);
  const apply = useCombatStore((s) => s.applyPendingDamage);
  const dismiss = useCombatStore((s) => s.dismissPendingDamage);
  const [targets, setTargets] = useState<Record<string, string>>({});
  if (pending.length === 0) return null;
  const candidates = (sourceId: string) =>
    combatants.filter((c) => c.id !== sourceId && !c.isLair && !c.dead);
  const targetFor = (p: PendingDamage): string => {
    const list = candidates(p.sourceId);
    const chosen = targets[p.id];
    if (chosen && list.some((c) => c.id === chosen)) return chosen;
    const selected = list.find((c) => c.id === selectedId);
    return selected?.id ?? list.find((c) => c.ref.kind === 'pc')?.id ?? list[0]?.id ?? '';
  };
  return (
    <div className="card pending-damage" data-testid="pending-damage">
      <h2>Rolled damage</h2>
      {pending.map((p) => {
        const target = targetFor(p);
        const list = candidates(p.sourceId);
        return (
          <div key={p.id} className="row" data-testid="pending-row">
            <span>
              <strong>{p.sourceName}</strong> — {p.featureName}
              {p.hit ? (
                <span className={p.hit.crit ? 'crit' : p.hit.fumble ? 'fumble' : ''}>
                  {' '}
                  · to hit {p.hit.total}
                  {p.hit.crit ? ' (crit)' : p.hit.fumble ? ' (natural 1)' : ''}
                </span>
              ) : null}{' '}
              · {p.parts.map((x) => `${x.amount}${x.type ? ` ${x.type}` : ''}`).join(' + ')}
            </span>
            <select
              aria-label={`Target for ${p.featureName}`}
              value={target}
              onChange={(e) => setTargets({ ...targets, [p.id]: e.target.value })}
            >
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.hp.current}/{c.hp.max})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn primary"
              disabled={!target}
              onClick={() => apply(p.id, target, false)}
            >
              Apply
            </button>
            <button
              type="button"
              className="btn"
              disabled={!target}
              onClick={() => apply(p.id, target, true)}
            >
              Half
            </button>
            <button type="button" className="btn" onClick={() => dismiss(p.id)}>
              Dismiss
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SaveCallPanel() {
  const call = useCombatStore((s) => s.saveCall);
  const applySaveDamage = useCombatStore((s) => s.applySaveDamage);
  const clear = useCombatStore((s) => s.clearSaveCall);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('');
  if (!call) return null;
  const n = Number.parseInt(amount, 10);
  return (
    <div className="card save-call" data-testid="save-call">
      <div className="row">
        <strong>
          {call.sourceName} — {call.featureName}: DC {call.dc} {call.ability.toUpperCase()} save
          {call.halfOnSuccess ? ' (half on success)' : ''}
        </strong>
        <span className="spacer" />
        <button type="button" className="btn" onClick={clear}>
          Close
        </button>
      </div>
      {call.creatures.length > 0 && (
        <p>
          Creatures:{' '}
          {call.creatures
            .map(
              (x) =>
                `${x.name} ${x.total}${x.natural === 20 ? ' (nat 20)' : ''} ${x.success ? '✓' : '✗'}`,
            )
            .join(' · ')}
        </p>
      )}
      {call.pcs.length > 0 && (
        <p>
          PCs roll:{' '}
          {call.pcs.map((p) => `${p.name} ${p.bonus >= 0 ? '+' : ''}${p.bonus}`).join(' · ')}
        </p>
      )}
      <div className="row">
        <input
          type="number"
          className="narrow"
          aria-label="Save damage"
          placeholder="damage"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <select
          aria-label="Save damage type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {DAMAGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t || 'any type'}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn primary"
          disabled={!Number.isFinite(n) || n <= 0}
          onClick={() => applySaveDamage(n, type || undefined)}
        >
          Apply to creatures{call.halfOnSuccess ? ' (half on success)' : ' (failures only)'}
        </button>
      </div>
    </div>
  );
}

/** The combat tracker (DESIGN.md §6.4). */
export function CombatView() {
  const state = useCombatStore((s) => s.state);
  const records = useCombatStore((s) => s.records);
  const selectedId = useCombatStore((s) => s.selectedId);
  const rollMode = useCombatStore((s) => s.rollMode);
  const missing = useCombatStore((s) => s.missing);
  const savePrompts = useCombatStore((s) => s.savePrompts);
  const concentration = useCombatStore((s) => s.concentrationPrompt);
  const error = useCombatStore((s) => s.error);
  const store = useCombatStore();
  const putEncounter = useCampaignStore((s) => s.putEncounter);
  const openByKey = useCompendiumStore((s) => s.openByKey);
  const setSection = useUiStore((s) => s.setSection);
  const [showLog, setShowLog] = useState(true);

  if (!state) return null;
  const selected = state.combatants.find((c) => c.id === selectedId) ?? null;
  const record = selected?.recordId ? records[selected.recordId] : undefined;
  const unrolled = state.combatants.filter((c) => c.initiative === null);
  const active = state.combatants[state.turnIndex];

  const endCombat = async () => {
    const result = await store.end();
    if (result) {
      const enc = await window.trifold.campaigns.current();
      if (enc)
        putEncounter(
          enc.encounters.find((e) => e.results.some((r) => r.endedAt === result.endedAt)) ??
            enc.encounters[0]!,
        );
    }
  };

  return (
    <section className="combat">
      <div className="row combat-bar">
        <h1>
          {state.turnIndex < 0 ? 'Set initiative' : `Round ${state.round}`}
          {active && state.turnIndex >= 0 ? <span className="muted"> · {active.name}</span> : null}
        </h1>
        <span className="spacer" />
        <span className="seg" role="group" aria-label="Roll mode">
          {(['normal', 'advantage', 'disadvantage'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className="btn"
              aria-pressed={rollMode === m}
              onClick={() => store.setRollMode(m)}
            >
              {m === 'normal' ? 'Normal' : m === 'advantage' ? 'Adv' : 'Dis'}
            </button>
          ))}
        </span>
        {state.turnIndex < 0 ? (
          <>
            <button
              type="button"
              className="btn"
              disabled={unrolled.length === 0}
              onClick={() => store.rollMissingInitiatives()}
            >
              Roll remaining ({unrolled.length})
            </button>
            <button type="button" className="btn" onClick={() => store.sortByInitiative()}>
              Sort
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={unrolled.length > 0}
              onClick={() => {
                store.sortByInitiative();
                store.next();
              }}
            >
              Begin
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => store.previous()}>
              Previous
            </button>
            <button type="button" className="btn primary" onClick={() => store.next()}>
              Next turn (N)
            </button>
          </>
        )}
        <button type="button" className="btn" onClick={() => void endCombat()}>
          End combat
        </button>
      </div>

      {error && <div className="banner error">{error}</div>}
      {missing.length > 0 && (
        <div className="banner warn">
          Records not found (cached values used): {missing.join(', ')}
        </div>
      )}
      {concentration && (
        <div className="banner warn" role="alert">
          <span>
            {concentration.name} must make a DC {concentration.dc} Constitution save to keep
            concentrating.
          </span>
          <span className="row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                store.setConcentration(concentration.combatantId, null);
                store.dismissConcentration();
              }}
            >
              Failed, drop it
            </button>
            <button type="button" className="btn" onClick={() => store.dismissConcentration()}>
              Kept it
            </button>
          </span>
        </div>
      )}
      {savePrompts.map((p, i) => (
        <div key={`${p.combatantId}-${p.conditionId}`} className="banner warn" role="alert">
          <span>
            End of turn: {state.combatants.find((c) => c.id === p.combatantId)?.name} saves against{' '}
            {p.conditionName} (DC {p.dc} {p.ability.toUpperCase()}).
          </span>
          <span className="row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                store.removeCondition(p.combatantId, p.conditionId);
                store.dismissSavePrompt(i);
              }}
            >
              Saved, remove it
            </button>
            <button type="button" className="btn" onClick={() => store.dismissSavePrompt(i)}>
              Failed
            </button>
          </span>
        </div>
      ))}

      <div className="combat-split">
        <div className="initiative-list" role="listbox" aria-label="Initiative order">
          {state.combatants.map((c, i) => (
            <CombatantRow
              key={c.id}
              c={c}
              active={i === state.turnIndex}
              selected={c.id === selectedId}
            />
          ))}
        </div>
        <div className="combat-inspector">
          <PendingDamagePanel />
          <SaveCallPanel />
          {selected && <Inspector c={selected} />}
          {selected && record?.kind === 'monster' && (
            <StatBlock
              record={record}
              onOpenSpell={(key) => {
                void openByKey('spell', key).then((ok) => ok && setSection('compendium'));
              }}
              actions={{
                onAttack: (feature, attack) => store.rollAttackFor(selected.id, feature, attack),
                onRoll: (feature, button) => store.rollFeature(selected.id, feature, button),
                onSave: (feature, save) => store.callSave(selected.id, feature, save),
                onMultiattack: (feature) => store.rollMultiattack(selected.id, feature),
              }}
            />
          )}
          {selected && selected.ref.kind === 'pc' && (
            <p className="muted">PC card: no stat block. Ask the player.</p>
          )}
        </div>
        <div className="combat-log">
          <div className="row">
            <h2>Log</h2>
            <span className="spacer" />
            <button type="button" className="btn tiny" onClick={() => setShowLog((v) => !v)}>
              {showLog ? 'hide' : 'show'}
            </button>
          </div>
          {showLog && (
            <ol aria-label="Combat log">
              {[...state.log].reverse().map((e) => (
                <li key={e.id} className={`log-${e.kind}`}>
                  <span className="muted">R{e.round}</span> {e.text}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
