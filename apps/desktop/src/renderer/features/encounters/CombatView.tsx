import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Combatant, ConditionDuration } from '@trifold/schema';
import { registerHotkey } from '../../hotkeys';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore, type DamageTarget } from '../../stores/combatStore';
import { formatCombatLog, logFileName } from './logExport';
import { StatBlock } from '../compendium/StatBlock';
import { Icon } from '../shell/icons';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { useShellStore } from '../../stores/shellStore';

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

function signedText(n: number): string {
  return `${n >= 0 ? '+' : ''}${n}`;
}

function CombatantRow({
  c,
  active,
  selected,
  open,
  onToggle,
}: {
  c: Combatant;
  active: boolean;
  selected: boolean;
  open: boolean;
  onToggle(): void;
}) {
  const setInitiative = useCombatStore((s) => s.setInitiative);
  const rollInit = useCombatStore((s) => s.rollInitiativeFor);
  const move = useCombatStore((s) => s.move);
  return (
    <div
      className={`combatant-row role-${c.role}${active ? ' active' : ''}${selected ? ' selected' : ''}${open ? ' open' : ''}${c.dead ? ' dead' : ''}${c.held ? ' held' : ''}`}
      data-testid="combatant-row"
      onClick={onToggle}
      aria-current={active ? 'step' : undefined}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onToggle();
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
          className="chrome-btn xs"
          aria-label={`Move ${c.name} up`}
          title="Move up"
          onClick={(e) => {
            e.stopPropagation();
            move(c.id, -1);
          }}
        >
          <Icon name="up" size={12} />
        </button>
        <button
          type="button"
          className="chrome-btn xs"
          aria-label={`Move ${c.name} down`}
          title="Move down"
          onClick={(e) => {
            e.stopPropagation();
            move(c.id, 1);
          }}
        >
          <Icon name="down" size={12} />
        </button>
      </span>
    </div>
  );
}

/**
 * The selected combatant's controls, opened under its row in the initiative list: HP first,
 * then conditions, concentration and resources, with the row-level toggles in one toolbar.
 */
function CombatantDrawer({
  c,
  onAssign,
}: {
  c: Combatant;
  onAssign(amount: number, type: string): void;
}) {
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
    <div className="combatant-drawer" data-testid="combatant-drawer">
      <div className="drawer-body" role="region" aria-label={`${c.name} controls`}>
        <div className="row drawer-head">
          <span className="muted">
            {c.ac !== undefined ? `AC ${c.ac} · ` : ''}init {signedText(c.initiativeBonus)}
          </span>
          <span className="spacer" />
          <span className="icon-toolbar" role="group" aria-label="Combatant actions">
            {!c.revealed && c.ref.kind !== 'pc' && (
              <button
                type="button"
                className="chrome-btn"
                aria-label="Reveal name"
                title="Reveal name to the players"
                onClick={() => store.reveal(c.id)}
              >
                <Icon name="tv" size={15} />
              </button>
            )}
            <button
              type="button"
              className={`chrome-btn${c.hidden ? ' on' : ''}`}
              aria-label={c.hidden ? 'Unhide' : 'Hide'}
              aria-pressed={c.hidden}
              title={c.hidden ? 'Unhide' : 'Hide from the players'}
              onClick={() => store.toggleHidden(c.id)}
            >
              <Icon name="image" size={15} />
            </button>
            <button
              type="button"
              className={`chrome-btn${c.held ? ' on' : ''}`}
              aria-label={c.held ? 'Release' : 'Hold'}
              aria-pressed={c.held}
              title={c.held ? 'Release the held turn' : 'Hold the turn'}
              onClick={() => store.toggleHeld(c.id)}
            >
              <Icon name="pause" size={15} />
            </button>
            <button
              type="button"
              className={`chrome-btn${c.dead ? ' on' : ''}`}
              aria-label={c.dead ? 'Revive' : 'Mark dead'}
              aria-pressed={c.dead}
              title={c.dead ? 'Revive' : 'Mark dead'}
              onClick={() => store.markDead(c.id, !c.dead)}
            >
              <Icon name="combat" size={15} />
            </button>
            <button
              type="button"
              className="chrome-btn danger"
              aria-label="Remove"
              title="Remove from the fight"
              onClick={() => store.remove(c.id)}
            >
              <Icon name="trash" size={15} />
            </button>
          </span>
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
              className="chrome-btn"
              disabled={!valid}
              aria-label="Damage several"
              title="Deal this damage to several combatants, full or half each"
              onClick={() => {
                onAssign(n, type);
                setAmount('');
              }}
            >
              <Icon name="fanout" size={15} />
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

        <div className="row">
          {c.concentrating ? (
            <button
              type="button"
              className="btn"
              onClick={() => store.setConcentration(c.id, null)}
            >
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

        {c.counters.some((k) => k.kind === 'spellSlot') && (
          <div className="row counters slot-tracker" data-testid="slot-tracker">
            <span className="muted small">Slots</span>
            {c.counters
              .filter((k) => k.kind === 'spellSlot')
              .map((k) => (
                <span
                  key={k.id}
                  className="slot-level"
                  title={`${k.name}: ${k.current} of ${k.max} left`}
                >
                  <span className="slot-label">{ordinal(k.level ?? 0)}</span>
                  {Array.from({ length: k.max }, (_, i) => {
                    const available = i < k.current;
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`slot-pip${available ? ' available' : ' spent'}`}
                        aria-label={`${available ? 'Spend' : 'Restore'} level ${k.level} slot`}
                        aria-pressed={!available}
                        onClick={() => store.useCounter(c.id, k.id, available ? -1 : 1)}
                      />
                    );
                  })}
                </span>
              ))}
          </div>
        )}

        {(c.counters.some((k) => k.kind !== 'spellSlot') || c.recharges.length > 0) && (
          <div className="row counters">
            {c.counters
              .filter((k) => k.kind !== 'spellSlot')
              .map((k) => (
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
    </div>
  );
}

type Share = 'none' | DamageTarget['share'];

/** What the damage pop-up is assigning: a rolled attack, a called save, or a typed amount. */
interface DamageRequest {
  key: string;
  title: string;
  detail?: ReactNode;
  sourceId?: string;
  /** Rolled parts are fixed; without them the DM types the amount and type. */
  parts?: Array<{ amount: number; type?: string }>;
  amount?: number;
  type?: string;
  initial: Record<string, Share>;
  /** A save result (creatures) or save bonus (PCs) shown beside each target. */
  notes?: Record<string, { text: string; title: string; success?: boolean }>;
  apply(targets: DamageTarget[], parts: Array<{ amount: number; type?: string }>): void;
  dismiss(): void;
}

const SHARES: Array<{ share: Share; label: string; name: (who: string) => string }> = [
  { share: 'none', label: 'None', name: (who) => `No damage to ${who}` },
  { share: 'half', label: 'Half', name: (who) => `Half damage to ${who}` },
  { share: 'full', label: 'Full', name: (who) => `Full damage to ${who}` },
];

function affinity(c: Combatant, types: string[]): string | null {
  if (types.some((t) => c.damageImmunities.includes(t))) return 'immune';
  if (types.some((t) => c.damageResistances.includes(t))) return 'resists';
  if (types.some((t) => c.damageVulnerabilities.includes(t))) return 'vulnerable';
  return null;
}

/**
 * Assigns one damage roll to any number of combatants, full or half each. It floats over the
 * tracker without a backdrop or focus trap, so the fight stays usable while it is open
 * (CLAUDE.md: no modal dialogs during combat).
 */
function DamagePopup({ request, queued }: { request: DamageRequest; queued: number }) {
  const combatants = useCombatStore((s) => s.state?.combatants ?? []);
  const [shares, setShares] = useState<Record<string, Share>>(request.initial);
  const [amount, setAmount] = useState(request.amount ? String(request.amount) : '');
  const [type, setType] = useState(request.type ?? '');
  const ref = useRef<HTMLDivElement>(null);
  const targets = combatants.filter((c) => !c.isLair && !c.dead && c.id !== request.sourceId);
  const n = Number.parseInt(amount, 10);
  const parts =
    request.parts ??
    (Number.isFinite(n) && n > 0 ? [{ amount: n, ...(type ? { type } : {}) }] : []);
  const total = parts.reduce((sum, p) => sum + p.amount, 0);
  const halfTotal = parts.reduce((sum, p) => sum + Math.floor(p.amount / 2), 0);
  const types = parts.flatMap((p) => (p.type ? [p.type] : []));
  const chosen: DamageTarget[] = targets.flatMap((c) => {
    const share = shares[c.id] ?? 'none';
    return share === 'none' ? [] : [{ id: c.id, share }];
  });
  const canApply = chosen.length > 0 && parts.length > 0;
  const apply = () => {
    if (canApply) request.apply(chosen, parts);
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  useEffect(
    () =>
      registerHotkey({
        id: 'combat.applyDamage',
        combo: 'Ctrl+Enter',
        description: 'Apply the damage in the pop-up',
        run: () => applyRef.current(),
      }),
    [],
  );

  const setAll = (share: Share) => setShares(Object.fromEntries(targets.map((c) => [c.id, share])));

  return (
    <div
      ref={ref}
      className="damage-popup"
      role="dialog"
      aria-modal="false"
      aria-labelledby="damage-popup-title"
      data-testid="damage-popup"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          request.dismiss();
        }
      }}
    >
      <div className="row popup-head">
        <strong id="damage-popup-title">{request.title}</strong>
        {queued > 1 && <span className="badge">1 of {queued}</span>}
        <span className="spacer" />
        <button
          type="button"
          className="chrome-btn xs"
          aria-label="Dismiss damage"
          title="Dismiss (Esc)"
          onClick={request.dismiss}
        >
          <Icon name="close" size={13} />
        </button>
      </div>
      {request.detail && <div className="muted small popup-detail">{request.detail}</div>}
      {request.parts ? (
        <div className="popup-total">
          {request.parts.map((x) => `${x.amount}${x.type ? ` ${x.type}` : ''}`).join(' + ')}
          {request.parts.length > 1 ? ` = ${total}` : ''}
          <span className="muted"> · half {halfTotal}</span>
        </div>
      ) : (
        <div className="row">
          <input
            type="number"
            className="narrow"
            aria-label="Damage amount"
            placeholder="damage"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <select
            aria-label="Damage type for all targets"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {DAMAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t || 'any type'}
              </option>
            ))}
          </select>
          {total > 0 && <span className="muted">half {halfTotal}</span>}
        </div>
      )}
      <div className="row popup-quick">
        <span className="muted small">Set all</span>
        <button type="button" className="btn tiny" onClick={() => setAll('full')}>
          full
        </button>
        <button type="button" className="btn tiny" onClick={() => setAll('half')}>
          half
        </button>
        <button type="button" className="btn tiny" onClick={() => setAll('none')}>
          none
        </button>
      </div>
      <div className="damage-targets" role="group" aria-label="Targets">
        {targets.map((c) => {
          const share = shares[c.id] ?? 'none';
          const note = request.notes?.[c.id];
          const tag = affinity(c, types);
          return (
            <div
              key={c.id}
              className={`dmg-target role-${c.role}${share !== 'none' ? ' assigned' : ''}`}
            >
              <span className="dmg-name">
                <span className="dmg-label">{c.name}</span>
                <span className={hpClass(c)}>
                  {c.hp.current}/{c.hp.max}
                  {c.hp.temp > 0 ? ` +${c.hp.temp}` : ''}
                </span>
                {note && (
                  <span
                    className={`badge${note.success === true ? ' save' : note.success === false ? ' warn' : ''}`}
                    title={note.title}
                  >
                    {note.text}
                  </span>
                )}
                {tag && <span className="badge">{tag}</span>}
              </span>
              <span className="seg" role="group" aria-label={`Damage to ${c.name}`}>
                {SHARES.map((s) => (
                  <button
                    key={s.share}
                    type="button"
                    className="btn tiny"
                    aria-label={s.name(c.name)}
                    aria-pressed={share === s.share}
                    onClick={() => setShares({ ...shares, [c.id]: s.share })}
                  >
                    {s.label}
                  </button>
                ))}
              </span>
            </div>
          );
        })}
      </div>
      <div className="row popup-foot">
        <span className="muted small">
          {chosen.length === 0 ? 'Pick who takes it' : `${chosen.length} selected`}
        </span>
        <span className="spacer" />
        <button type="button" className="btn" onClick={request.dismiss}>
          Dismiss
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!canApply}
          title="Apply (Ctrl+Enter)"
          onClick={apply}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

/** Builds the pop-up's request: a typed amount first, then a called save, then rolled damage. */
function useDamageRequest(
  manual: { key: string; amount: number; type: string; targetId: string } | null,
  clearManual: () => void,
): { request: DamageRequest | null; queued: number } {
  const pending = useCombatStore((s) => s.pendingDamage);
  const call = useCombatStore((s) => s.saveCall);
  const store = useCombatStore();
  const queued = pending.length + (call ? 1 : 0) + (manual ? 1 : 0);

  if (manual) {
    return {
      queued,
      request: {
        key: manual.key,
        title: 'Damage several',
        amount: manual.amount,
        type: manual.type,
        initial: { [manual.targetId]: 'full' },
        apply: (targets, parts) => {
          store.damageTargets(targets, parts);
          clearManual();
        },
        dismiss: clearManual,
      },
    };
  }

  if (call) {
    const initial: Record<string, Share> = {};
    const notes: DamageRequest['notes'] = {};
    for (const x of call.creatures) {
      initial[x.id] = x.success ? (call.halfOnSuccess ? 'half' : 'none') : 'full';
      notes[x.id] = {
        text: `${x.total}${x.natural === 20 ? ' nat 20' : ''} ${x.success ? '✓' : '✗'}`,
        title: x.success ? 'Saved' : 'Failed',
        success: x.success,
      };
    }
    for (const p of call.pcs) {
      notes[p.id] = { text: signedText(p.bonus), title: 'Ask the player to roll' };
    }
    return {
      queued,
      request: {
        key: call.id,
        title: `${call.sourceName} — ${call.featureName}`,
        detail: `DC ${call.dc} ${call.ability.toUpperCase()} save · ${call.halfOnSuccess ? 'half on success' : 'no damage on success'}`,
        sourceId: call.sourceId,
        initial,
        notes,
        apply: (targets, parts) =>
          store.applySaveDamage(parts[0]?.amount ?? 0, parts[0]?.type, targets),
        dismiss: store.clearSaveCall,
      },
    };
  }

  const p = pending[0];
  if (!p) return { request: null, queued };
  return {
    queued,
    request: {
      key: p.id,
      title: `${p.sourceName} — ${p.featureName}`,
      detail: p.hit ? (
        <span className={p.hit.crit ? 'crit' : p.hit.fumble ? 'fumble' : ''}>
          To hit {p.hit.total}
          {p.hit.crit ? ' (crit)' : p.hit.fumble ? ' (natural 1)' : ''}
        </span>
      ) : undefined,
      sourceId: p.sourceId,
      parts: p.parts,
      initial: {},
      apply: (targets) => store.applyPendingDamage(p.id, targets),
      dismiss: () => store.dismissPendingDamage(p.id),
    },
  };
}

/** The combat tracker (DESIGN.md §6.4). */
export function CombatView() {
  const state = useCombatStore((s) => s.state);
  const records = useCombatStore((s) => s.records);
  const selectedId = useCombatStore((s) => s.selectedId);
  const missing = useCombatStore((s) => s.missing);
  const savePrompts = useCombatStore((s) => s.savePrompts);
  const concentration = useCombatStore((s) => s.concentrationPrompt);
  const error = useCombatStore((s) => s.error);
  const store = useCombatStore();
  const putEncounter = useCampaignStore((s) => s.putEncounter);
  const openByKey = useCompendiumStore((s) => s.openByKey);
  const openMajor = useShellStore((s) => s.openMajor);
  const [showLog, setShowLog] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [manual, setManual] = useState<{
    key: string;
    amount: number;
    type: string;
    targetId: string;
  } | null>(null);
  const { request, queued } = useDamageRequest(manual, () => setManual(null));

  // A new selection (a click, or the turn moving on) opens its drawer.
  useEffect(() => setDrawerOpen(true), [selectedId]);

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
        <button
          type="button"
          className="chrome-btn"
          aria-label="Back to encounters"
          title="Back to the encounter list (the fight keeps running)"
          onClick={() => store.setBrowsing(true)}
        >
          <Icon name="left" size={15} />
        </button>
        <h2>
          {state.turnIndex < 0 ? 'Set initiative' : `Round ${state.round}`}
          {active && state.turnIndex >= 0 ? <span className="muted"> · {active.name}</span> : null}
        </h2>
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
            <button
              type="button"
              className="chrome-btn"
              aria-label="Previous"
              title="Previous turn (P)"
              onClick={() => store.previous()}
            >
              <Icon name="prev" size={15} />
            </button>
            <button type="button" className="btn primary" onClick={() => store.next()}>
              Next turn (N)
            </button>
          </>
        )}
        <button
          type="button"
          className="chrome-btn"
          aria-label="End combat"
          title="End combat"
          onClick={() => void endCombat()}
        >
          <Icon name="close" size={15} />
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
        <div className="initiative-list" role="group" aria-label="Initiative order">
          {state.combatants.map((c, i) => {
            const isSelected = c.id === selectedId;
            const open = isSelected && drawerOpen;
            return (
              <div key={c.id} className="combatant-item">
                <CombatantRow
                  c={c}
                  active={i === state.turnIndex}
                  selected={isSelected}
                  open={open}
                  onToggle={() => {
                    if (isSelected) setDrawerOpen((v) => !v);
                    else store.select(c.id);
                  }}
                />
                {open && (
                  <CombatantDrawer
                    c={c}
                    onAssign={(amount, type) =>
                      setManual({ key: `manual-${Date.now()}`, amount, type, targetId: c.id })
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="combat-inspector">
          {!selected && <p className="muted">Select a combatant to see its stat block.</p>}
          {selected && record?.kind === 'monster' && (
            <StatBlock
              record={record}
              onOpenSpell={(key) => {
                void openByKey('spell', key).then(
                  (ok) => ok && openMajor('compendium', { avoid: 'encounters' }),
                );
              }}
              actions={{
                onAttack: (feature, attack, mode) =>
                  store.rollAttackFor(selected.id, feature, attack, mode),
                onRoll: (feature, button) => store.rollFeature(selected.id, feature, button),
                onSave: (feature, save) => store.callSave(selected.id, feature, save),
                onMultiattack: (feature, mode) => store.rollMultiattack(selected.id, feature, mode),
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
            <button
              type="button"
              className="btn tiny"
              onClick={() => {
                const encounterId = useCombatStore.getState().encounterId;
                const name =
                  useCampaignStore.getState().current?.encounters.find((e) => e.id === encounterId)
                    ?.name ?? 'Encounter';
                void window.trifold.app.saveTextFile({
                  title: 'Export combat log',
                  defaultName: logFileName(name, state.startedAt),
                  text: formatCombatLog(name, state),
                });
              }}
            >
              export
            </button>
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

      {request && (
        <div className="damage-anchor">
          <DamagePopup key={request.key} request={request} queued={queued} />
        </div>
      )}
    </section>
  );
}

function ordinal(n: number): string {
  const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
