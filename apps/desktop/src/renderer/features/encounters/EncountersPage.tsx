import { useEffect, useState } from 'react';
import { ulid } from 'ulid';
import type { CompendiumRow } from '@trifold/api';
import { difficultyBand, partyBudget } from '@trifold/rules';
import type { CombatantTemplate, Encounter, NPC, PCCard } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { cancelSave, encounterSlot, scheduleSave } from '../../stores/pendingSaves';
import { InlineConfirm } from '../shell/InlineConfirm';
import { Icon } from '../shell/icons';
import { AddPanel } from './AddPanel';
import { CombatView } from './CombatView';
import { retargetToNpc } from './templates';

/**
 * The Encounters major (DESIGN.md §6.4, ADR 0005): the encounter list and builder while no
 * fight runs, the combat tracker while one does. `EncountersPage` at the end of the file is the
 * tab; `Builder` and `TemplateRow` above it edit one encounter's templates, with the 2024 budget
 * band, Track as NPC (ADR 0012) and an autosave that writes only while it is safe to.
 */
const NO_NPCS: NPC[] = [];
const NO_PCS: PCCard[] = [];

function newEncounter(name: string): Encounter {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: '',
    name,
    combatants: [],
    notes: '',
    state: null,
    results: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * One combatant in the builder: a single line, with the label behind a pencil (UI-GUIDELINES.md
 * §8, ADR 0013).
 */
function TemplateRow({
  t,
  onChange,
  onRemove,
  onTrackAsNpc,
}: {
  t: CombatantTemplate;
  onChange(patch: Partial<CombatantTemplate>): void;
  onRemove(): void;
  onTrackAsNpc(): void;
}) {
  const [editing, setEditing] = useState(false);
  const name = t.label || t.ref.name;
  const creature = t.ref.kind === 'record' || t.ref.kind === 'custom';
  const meta = [
    t.label ? t.ref.name : '',
    t.cache && (t.cache.cr || t.cache.xp) ? `CR ${t.cache.cr} · ${t.cache.xp} XP` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className={`template-row role-${t.role}`} data-testid="template-row">
      <div className="template-name">
        {editing ? (
          <input
            type="text"
            aria-label={`Label for ${t.ref.name}`}
            placeholder={t.ref.name}
            autoFocus
            defaultValue={t.label ?? ''}
            onBlur={(e) => {
              onChange({ label: e.target.value.trim() || undefined });
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                e.currentTarget.value = t.label ?? '';
                e.currentTarget.blur();
              }
            }}
          />
        ) : (
          <>
            <span className="template-title">
              <strong>{name}</strong>
              {t.ref.kind === 'npc' && (
                <span className="badge" title="A named NPC: HP carries between fights">
                  NPC
                </span>
              )}
            </span>
            {meta && <span className="muted small">{meta}</span>}
          </>
        )}
      </div>
      <span className="template-qty">
        {creature && (
          <input
            type="number"
            className="narrow"
            aria-label={`How many ${t.ref.name}`}
            title="How many"
            min={1}
            max={50}
            value={t.quantity}
            onChange={(e) => onChange({ quantity: Math.max(1, Number(e.target.value) || 1) })}
          />
        )}
      </span>
      <select
        aria-label={`Role of ${name}`}
        value={t.role}
        onChange={(e) => onChange({ role: e.target.value as CombatantTemplate['role'] })}
      >
        <option value="enemy">enemy</option>
        <option value="ally">ally</option>
        <option value="neutral">neutral</option>
      </select>
      <span className="icon-toolbar state-toolbar" role="group" aria-label={`${name} actions`}>
        <button
          type="button"
          className={`chrome-btn${t.hidden ? ' on' : ''}`}
          aria-label={t.hidden ? `Show ${name} to players` : `Hide ${name} from players`}
          aria-pressed={t.hidden}
          title={
            t.hidden ? 'Starts hidden from the players. Show it' : 'Start hidden from the players'
          }
          onClick={() => onChange({ hidden: !t.hidden })}
        >
          <Icon name={t.hidden ? 'eyeOff' : 'eye'} />
        </button>
        <button
          type="button"
          className="chrome-btn"
          aria-label={`Label ${t.ref.name}`}
          title="Give it a label (players still see the masked name)"
          onClick={() => setEditing(true)}
        >
          <Icon name="pencil" />
        </button>
        {creature && (
          <button
            type="button"
            className="chrome-btn"
            aria-label={`Track ${name} as NPC`}
            title="Make this a named NPC whose HP carries to the next fight"
            onClick={onTrackAsNpc}
          >
            <Icon name="person" />
          </button>
        )}
        <button
          type="button"
          className="chrome-btn"
          aria-label={`Remove ${name}`}
          title="Remove from the encounter"
          onClick={onRemove}
        >
          <Icon name="close" />
        </button>
      </span>
    </div>
  );
}

function Builder({
  encounter,
  onChange,
  onStart,
  fightRunning,
}: {
  encounter: Encounter;
  onChange(e: Encounter): void;
  onStart(): void;
  fightRunning: boolean;
}) {
  const pcs = useCampaignStore((s) => s.current?.pcs ?? NO_PCS);
  const npcs = useCampaignStore((s) => s.current?.npcs ?? NO_NPCS);
  const saveNpc = useCampaignStore((s) => s.saveNpc);

  const set = (patch: Partial<Encounter>) => onChange({ ...encounter, ...patch });
  const setTemplate = (id: string, patch: Partial<CombatantTemplate>) =>
    set({ combatants: encounter.combatants.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  const presentPcs = new Set(
    encounter.combatants.flatMap((t) => (t.ref.kind === 'pc' ? [t.ref.pcId] : [])),
  );
  const presentNpcs = new Set(
    encounter.combatants.flatMap((t) => (t.ref.kind === 'npc' ? [t.ref.npcId] : [])),
  );

  const addPcs = (ids: string[]) => {
    const added: CombatantTemplate[] = pcs
      .filter((p) => ids.includes(p.id) && !presentPcs.has(p.id))
      .map((p) => ({
        id: ulid(),
        ref: { kind: 'pc', pcId: p.id, name: p.name },
        quantity: 1,
        role: 'ally',
        hidden: false,
      }));
    if (added.length) set({ combatants: [...encounter.combatants, ...added] });
  };

  /** NPCs that can fight (a stat block, or HP left over from a fight) and are not in yet. */
  const waitingNpcs = npcs.filter((n) => (n.recordRef || n.hp) && !presentNpcs.has(n.id));

  const addNpc = async (npc: NPC) => {
    if (presentNpcs.has(npc.id)) return;
    const record = npc.recordRef
      ? await window.trifold.compendium.get(npc.recordRef.recordId).catch(() => null)
      : null;
    const cache =
      record?.kind === 'monster'
        ? {
            xp: record.data.xp,
            cr: record.data.cr,
            type: record.data.type,
            hp: npc.hp?.max ?? record.data.hp?.average ?? 0,
            ac: record.data.ac?.value ?? 10,
          }
        : { xp: 0, cr: '', type: '', hp: npc.hp?.max ?? 0, ac: 10 };
    set({
      combatants: [
        ...encounter.combatants,
        {
          id: ulid(),
          ref: { kind: 'npc', npcId: npc.id, name: npc.name },
          quantity: 1,
          role: 'enemy',
          hidden: false,
          cache,
        },
      ],
    });
  };

  /** A creature becomes a named NPC whose HP carries between fights (ADR 0012). */
  const trackAsNpc = async (t: CombatantTemplate) => {
    const max = t.hpOverride ?? t.cache?.hp;
    const npc = await saveNpc({
      schemaVersion: 1,
      id: '',
      name: t.label || t.ref.name,
      ...(t.ref.kind === 'record' ? { recordRef: t.ref.ref } : {}),
      role: '',
      location: '',
      notes: '',
      isAlive: true,
      ...(max ? { hp: { current: max, max, temp: 0 } } : {}),
      createdAt: '',
      updatedAt: '',
    });
    if (npc) set({ combatants: retargetToNpc(encounter.combatants, t.id, npc) });
  };

  const addCreature = async (row: CompendiumRow) => {
    const record = await window.trifold.compendium.get(row.id);
    const cache =
      record?.kind === 'monster'
        ? {
            xp: record.data.xp,
            cr: record.data.cr,
            type: record.data.type,
            hp: record.data.hp?.average ?? 0,
            ac: record.data.ac?.value ?? 10,
          }
        : { xp: 0, cr: row.cr ?? '', type: row.type ?? '', hp: 0, ac: 10 };
    set({
      combatants: [
        ...encounter.combatants,
        {
          id: ulid(),
          ref: {
            kind: 'record',
            ref: {
              recordId: row.id,
              sourceId: row.sourceId,
              key: row.key,
              edition: row.edition as 'unknown',
            },
            name: row.displayName,
          },
          quantity: 1,
          role: 'enemy',
          hidden: false,
          cache,
        },
      ],
    });
  };

  const partyLevels = encounter.combatants
    .filter((t) => t.ref.kind === 'pc')
    .map((t) => pcs.find((p) => t.ref.kind === 'pc' && p.id === t.ref.pcId)?.level ?? 1);
  const budget = partyBudget(partyLevels);
  const enemyXp = encounter.combatants
    .filter((t) => t.role === 'enemy')
    .reduce((n, t) => n + (t.cache?.xp ?? 0) * t.quantity, 0);
  const band = partyLevels.length ? difficultyBand(enemyXp, budget) : null;

  return (
    <div className="card builder">
      <div className="row">
        <input
          type="text"
          aria-label="Encounter name"
          value={encounter.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <span className="spacer" />
        <button
          type="button"
          className="btn primary"
          disabled={encounter.combatants.length === 0 || fightRunning}
          title={fightRunning ? 'End the current fight first' : undefined}
          onClick={onStart}
        >
          Start combat
        </button>
      </div>

      <h2 className="mt">Combatants</h2>
      {encounter.combatants.length === 0 ? (
        <p className="muted">Add the party and some creatures below.</p>
      ) : (
        <div className="template-list">
          {encounter.combatants.map((t) => (
            <TemplateRow
              key={t.id}
              t={t}
              onChange={(patch) => setTemplate(t.id, patch)}
              onRemove={() =>
                set({ combatants: encounter.combatants.filter((x) => x.id !== t.id) })
              }
              onTrackAsNpc={() => void trackAsNpc(t)}
            />
          ))}
        </div>
      )}
      {partyLevels.length === 0 ? (
        <p className="muted small">Add PCs to see the 2024 difficulty budget.</p>
      ) : (
        <div className="difficulty" data-testid="difficulty">
          <span>
            Enemy XP {enemyXp.toLocaleString()} · <strong>{band}</strong> ·{' '}
            {Math.round(enemyXp / partyLevels.length).toLocaleString()} XP per PC
          </span>
          <span className="muted small">
            2024 budget: low {budget.low.toLocaleString()} · moderate{' '}
            {budget.moderate.toLocaleString()} · high {budget.high.toLocaleString()}
          </span>
        </div>
      )}

      <h2 className="mt">Add</h2>
      <AddPanel
        pcs={pcs.filter((p) => !presentPcs.has(p.id))}
        npcs={waitingNpcs}
        onAddPcs={addPcs}
        onAddNpc={(n) => void addNpc(n)}
        onAddCreature={addCreature}
      />

      <h2 className="mt">DM notes</h2>
      <textarea
        aria-label="DM notes"
        className="encounter-notes"
        rows={3}
        placeholder="Shown beside the stat block while the fight runs"
        value={encounter.notes}
        onChange={(e) => set({ notes: e.target.value })}
      />
    </div>
  );
}

/**
 * The builder's autosave. It may land after the builder moved on, so it writes only while the
 * encounter is still in the open campaign and not in a fight: never into another campaign, never
 * bringing back a deleted encounter, never overwriting a running fight's state.
 */
function saveBuilderDraft(draft: Encounter) {
  const campaign = useCampaignStore.getState();
  const saved = campaign.current?.encounters.find((e) => e.id === draft.id);
  if (!saved || saved.state) return;
  return campaign.saveEncounter(draft);
}

/**
 * Encounter list and builder (DESIGN.md §6.4). While a fight runs the tab is the combat tracker
 * instead, with the list a click away (ADR 0005); when it ends, the result shows once.
 */
export function EncountersPage() {
  const current = useCampaignStore((s) => s.current);
  const load = useCampaignStore((s) => s.load);
  const saveEncounter = useCampaignStore((s) => s.saveEncounter);
  const removeEncounter = useCampaignStore((s) => s.removeEncounter);
  const begin = useCombatStore((s) => s.begin);
  const resume = useCombatStore((s) => s.resume);
  const fightId = useCombatStore((s) => s.encounterId);
  const round = useCombatStore((s) => s.state?.round ?? 0);
  const browsing = useCombatStore((s) => s.browsing);
  const setBrowsing = useCombatStore((s) => s.setBrowsing);
  const finished = useCombatStore((s) => s.finished);
  const dismissFinished = useCombatStore((s) => s.dismissFinished);
  const [draft, setDraft] = useState<Encounter | null>(null);
  /** The saved encounter whose delete is waiting on the inline confirm. */
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!current) void load();
  }, [current, load]);

  // Autosave the builder draft.
  useEffect(() => {
    if (!draft || !draft.id) return;
    // Each encounter has its own slot, so switching encounters, Back or closing the panel lets
    // the last edit land rather than dropping it (ADR 0015).
    scheduleSave(encounterSlot(draft.id), () => saveBuilderDraft(draft), 400);
  }, [draft]);

  if (!current) {
    return (
      <section>
        <p className="muted">Open a campaign first (Campaign panel).</p>
      </section>
    );
  }

  if (fightId && !browsing) return <CombatView />;

  const fightName = current.encounters.find((e) => e.id === fightId)?.name ?? 'Combat';
  const finishedEncounter = finished
    ? current.encounters.find((e) => e.id === finished.encounterId)
    : undefined;

  const startCombat = async () => {
    if (!draft) return;
    cancelSave(encounterSlot(draft.id));
    const saved = await saveEncounter(draft);
    if (!saved) return;
    await begin(saved, current.pcs, current.campaign.settings.initiativeMode);
    setDraft(null);
  };

  return (
    <section className="encounters">
      {fightId && (
        <div className="banner" role="status">
          <span>
            {fightName} is running{round > 0 ? ` · round ${round}` : ''}.
          </span>
          <button type="button" className="btn primary" onClick={() => setBrowsing(false)}>
            Return to fight
          </button>
        </div>
      )}
      {finished && !fightId && (
        <div className="card" data-testid="fight-result">
          <div className="row">
            <h2>{finishedEncounter?.name ?? 'Encounter'} finished</h2>
            <span className="spacer" />
            <button
              type="button"
              className="chrome-btn xs"
              aria-label="Dismiss result"
              title="Dismiss"
              onClick={dismissFinished}
            >
              <Icon name="close" />
            </button>
          </div>
          <p className="muted">
            {finished.result.rounds} rounds · {finished.result.xpEarned} XP
            {finished.result.casualties.length
              ? ` · fallen: ${finished.result.casualties.join(', ')}`
              : ''}
          </p>
        </div>
      )}
      {draft ? (
        <>
          <div className="row">
            <button
              type="button"
              className="chrome-btn"
              aria-label="Back to list"
              title="Back to list"
              onClick={() => setDraft(null)}
            >
              <Icon name="left" />
            </button>
          </div>
          <Builder
            encounter={draft}
            onChange={setDraft}
            onStart={() => void startCombat()}
            fightRunning={!!fightId}
          />
        </>
      ) : (
        <div className="card">
          <div className="row">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                void saveEncounter(newEncounter('New encounter')).then(
                  (saved) => saved && setDraft(saved),
                );
              }}
            >
              New encounter
            </button>
          </div>
          {current.encounters.length === 0 && <p className="muted">No encounters yet.</p>}
          {current.encounters.map((e) => (
            <div key={e.id} className="row encounter-row" data-testid="encounter-row">
              <div className="encounter-row-text">
                <strong>{e.name}</strong>
                <span className="muted">
                  {e.combatants.reduce((n, t) => n + t.quantity, 0)} combatants
                  {e.results.length ? ` · fought ${e.results.length}×` : ''}
                </span>
                {e.state && (
                  <span className="badge warn">combat in progress · round {e.state.round}</span>
                )}
              </div>
              {confirmDelete === e.id ? (
                <span className="encounter-row-actions">
                  <InlineConfirm
                    name={e.name}
                    onConfirm={() => {
                      setConfirmDelete(null);
                      void removeEncounter(e.id);
                    }}
                    onKeep={() => setConfirmDelete(null)}
                  />
                </span>
              ) : (
                <span className="encounter-row-actions">
                  <span className="row-actions pinned">
                    {!e.state && (
                      <button
                        type="button"
                        className="chrome-btn xs"
                        aria-label={`Edit ${e.name}`}
                        title="Edit"
                        onClick={() => setDraft(e)}
                      >
                        <Icon name="pencil" />
                      </button>
                    )}
                    {e.id !== fightId && (
                      <button
                        type="button"
                        className="chrome-btn xs danger"
                        aria-label={`Delete ${e.name}`}
                        title="Delete"
                        onClick={() => setConfirmDelete(e.id)}
                      >
                        <Icon name="trash" />
                      </button>
                    )}
                  </span>
                  {e.id === fightId ? (
                    <button
                      type="button"
                      className="chrome-btn xs"
                      aria-label={`Return to fight: ${e.name}`}
                      title="Return to fight"
                      onClick={() => setBrowsing(false)}
                    >
                      <Icon name="play" />
                    </button>
                  ) : e.state ? (
                    <button
                      type="button"
                      className="chrome-btn xs"
                      aria-label={`Resume combat: ${e.name}`}
                      title={fightId ? 'End the current fight first' : 'Resume combat'}
                      disabled={!!fightId}
                      onClick={() => void resume(e)}
                    >
                      <Icon name="play" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="chrome-btn xs"
                      aria-label={`Start combat: ${e.name}`}
                      title={
                        fightId
                          ? 'End the current fight first'
                          : e.combatants.length === 0
                            ? 'Add combatants first'
                            : 'Start combat'
                      }
                      disabled={e.combatants.length === 0 || !!fightId}
                      onClick={() =>
                        void begin(e, current.pcs, current.campaign.settings.initiativeMode)
                      }
                    >
                      <Icon name="play" />
                    </button>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
