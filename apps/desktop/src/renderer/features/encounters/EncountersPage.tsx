import { useEffect, useRef, useState } from 'react';
import { ulid } from 'ulid';
import type { CompendiumRow } from '@trifold/api';
import { difficultyBand, partyBudget } from '@trifold/rules';
import type { CombatantTemplate, Encounter } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { CombatView } from './CombatView';

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

function Builder({
  encounter,
  onChange,
  onStart,
}: {
  encounter: Encounter;
  onChange(e: Encounter): void;
  onStart(): void;
}) {
  const pcs = useCampaignStore((s) => s.current?.pcs ?? []);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CompendiumRow[]>([]);
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    if (!query.trim()) {
      setRows([]);
      return;
    }
    debounce.current = window.setTimeout(() => {
      window.trifold.compendium
        .search({ kind: 'monster', text: query, limit: 12 })
        .then((r) => setRows(r.rows))
        .catch(() => setRows([]));
    }, 150);
  }, [query]);

  const set = (patch: Partial<Encounter>) => onChange({ ...encounter, ...patch });
  const setTemplate = (id: string, patch: Partial<CombatantTemplate>) =>
    set({ combatants: encounter.combatants.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  const addPcs = (ids: string[]) => {
    const present = new Set(
      encounter.combatants
        .filter((t) => t.ref.kind === 'pc')
        .map((t) => (t.ref.kind === 'pc' ? t.ref.pcId : '')),
    );
    const added: CombatantTemplate[] = pcs
      .filter((p) => ids.includes(p.id) && !present.has(p.id))
      .map((p) => ({
        id: ulid(),
        ref: { kind: 'pc', pcId: p.id, name: p.name },
        quantity: 1,
        role: 'ally',
        hidden: false,
      }));
    if (added.length) set({ combatants: [...encounter.combatants, ...added] });
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
    setQuery('');
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
          disabled={encounter.combatants.length === 0}
          onClick={onStart}
        >
          Start combat
        </button>
      </div>

      <h2 className="mt">Combatants</h2>
      {encounter.combatants.length === 0 && (
        <p className="muted">Add the party and some creatures.</p>
      )}
      {encounter.combatants.map((t) => (
        <div key={t.id} className="row template-row" data-testid="template-row">
          <strong>{t.ref.name}</strong>
          {t.cache && (
            <span className="muted">
              CR {t.cache.cr} · {t.cache.xp} XP
            </span>
          )}
          {t.ref.kind !== 'pc' && (
            <label className="field inline">
              ×
              <input
                type="number"
                className="narrow"
                min={1}
                max={50}
                value={t.quantity}
                onChange={(e) =>
                  setTemplate(t.id, { quantity: Math.max(1, Number(e.target.value) || 1) })
                }
              />
            </label>
          )}
          <input
            type="text"
            className="narrow-text"
            placeholder="label"
            value={t.label ?? ''}
            onChange={(e) => setTemplate(t.id, { label: e.target.value || undefined })}
          />
          <select
            aria-label="Role"
            value={t.role}
            onChange={(e) =>
              setTemplate(t.id, { role: e.target.value as CombatantTemplate['role'] })
            }
          >
            <option value="enemy">enemy</option>
            <option value="ally">ally</option>
            <option value="neutral">neutral</option>
          </select>
          <label className="field inline">
            <input
              type="checkbox"
              checked={t.hidden}
              onChange={(e) => setTemplate(t.id, { hidden: e.target.checked })}
            />{' '}
            hidden
          </label>
          <span className="spacer" />
          <button
            type="button"
            className="btn"
            onClick={() => set({ combatants: encounter.combatants.filter((x) => x.id !== t.id) })}
          >
            Remove
          </button>
        </div>
      ))}

      <div className="row">
        <button
          type="button"
          className="btn"
          disabled={pcs.length === 0}
          onClick={() => addPcs(pcs.map((p) => p.id))}
        >
          Add all PCs
        </button>
        {pcs.map((p) => (
          <button key={p.id} type="button" className="btn" onClick={() => addPcs([p.id])}>
            + {p.name}
          </button>
        ))}
      </div>
      <div className="row">
        <input
          type="text"
          aria-label="Add creature"
          placeholder="Search creatures to add"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {rows.length > 0 && (
        <div className="picker" role="listbox" aria-label="Creature results">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              role="option"
              aria-selected={false}
              className="list-row"
              onClick={() => void addCreature(r)}
            >
              <span className="list-name">{r.displayName}</span>
              <span className="list-meta">
                {r.cr !== null && <span>CR {r.cr}</span>}
                {r.type && <span>{r.type}</span>}
                <span className="badge">{r.edition === '2014' ? 'legacy' : r.edition}</span>
                <span className="badge source">{r.sourceName}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <h2 className="mt">Difficulty (2024 budget)</h2>
      {partyLevels.length === 0 ? (
        <p className="muted">Add PCs to see the party budget.</p>
      ) : (
        <p data-testid="difficulty">
          Enemy XP {enemyXp.toLocaleString()} · party budget low {budget.low.toLocaleString()} /
          moderate {budget.moderate.toLocaleString()} / high {budget.high.toLocaleString()} ·{' '}
          <strong>{band}</strong> · {Math.round(enemyXp / partyLevels.length).toLocaleString()} XP
          per PC
        </p>
      )}
      <label className="field">
        Notes
        <textarea
          rows={2}
          value={encounter.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </label>
    </div>
  );
}

/** Encounter list, builder and the combat tracker (DESIGN.md §6.4). */
export function EncountersPage() {
  const current = useCampaignStore((s) => s.current);
  const load = useCampaignStore((s) => s.load);
  const saveEncounter = useCampaignStore((s) => s.saveEncounter);
  const removeEncounter = useCampaignStore((s) => s.removeEncounter);
  const combatEncounterId = useCombatStore((s) => s.encounterId);
  const begin = useCombatStore((s) => s.begin);
  const resume = useCombatStore((s) => s.resume);
  const [draft, setDraft] = useState<Encounter | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!current) void load();
  }, [current, load]);

  // Autosave the builder draft.
  useEffect(() => {
    if (!draft || !draft.id) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveEncounter(draft), 400);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [draft, saveEncounter]);

  if (!current) {
    return (
      <section>
        <h1>Encounters</h1>
        <p className="muted">Open a campaign first (Campaign section).</p>
      </section>
    );
  }

  if (combatEncounterId) {
    return <CombatView />;
  }

  const startCombat = async () => {
    if (!draft) return;
    const saved = await saveEncounter(draft);
    if (!saved) return;
    await begin(saved, current.pcs, current.campaign.settings.initiativeMode);
    setDraft(null);
  };

  return (
    <section className="encounters">
      <h1>Encounters</h1>
      {draft ? (
        <>
          <div className="row">
            <button type="button" className="btn" onClick={() => setDraft(null)}>
              Back to list
            </button>
          </div>
          <Builder encounter={draft} onChange={setDraft} onStart={() => void startCombat()} />
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
            <div key={e.id} className="row" data-testid="encounter-row">
              <strong>{e.name}</strong>
              <span className="muted">
                {e.combatants.reduce((n, t) => n + t.quantity, 0)} combatants
                {e.results.length ? ` · fought ${e.results.length}×` : ''}
              </span>
              {e.state && (
                <span className="badge warn">combat in progress · round {e.state.round}</span>
              )}
              <span className="spacer" />
              {e.state ? (
                <button type="button" className="btn primary" onClick={() => void resume(e)}>
                  Resume combat
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={e.combatants.length === 0}
                    onClick={() =>
                      void begin(e, current.pcs, current.campaign.settings.initiativeMode)
                    }
                  >
                    Start combat
                  </button>
                  <button type="button" className="btn" onClick={() => setDraft(e)}>
                    Edit
                  </button>
                </>
              )}
              <button type="button" className="btn" onClick={() => void removeEncounter(e.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
