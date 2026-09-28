import { useEffect, useState } from 'react';
import type { PCCard } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

function num(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function PcEditor({
  pc,
  onSave,
  onCancel,
}: {
  pc: PCCard;
  onSave(pc: PCCard): void;
  onCancel(): void;
}) {
  const [draft, setDraft] = useState<PCCard>(pc);
  const field = (label: string, key: keyof PCCard, type: 'text' | 'number' = 'text') => (
    <label className="field">
      {label}
      <input
        type={type}
        value={String(draft[key] ?? '')}
        onChange={(e) =>
          setDraft({
            ...draft,
            [key]:
              type === 'number' ? num(e.target.value, Number(draft[key]) || 0) : e.target.value,
          })
        }
      />
    </label>
  );
  return (
    <form
      className="card pc-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.name.trim()) onSave({ ...draft, name: draft.name.trim() });
      }}
    >
      <div className="grid-fields">
        {field('Name', 'name')}
        {field('Player', 'playerName')}
        {field('Class', 'classText')}
        {field('Level', 'level', 'number')}
        {field('Max HP', 'maxHp', 'number')}
        {field('AC', 'ac', 'number')}
        {field('Initiative bonus', 'initiativeBonus', 'number')}
        {field('Speed', 'speed', 'number')}
        <label className="field">
          Passive Perception
          <input
            type="number"
            value={draft.passives.perception}
            onChange={(e) =>
              setDraft({
                ...draft,
                passives: { ...draft.passives, perception: num(e.target.value, 10) },
              })
            }
          />
        </label>
        <label className="field">
          Passive Insight
          <input
            type="number"
            value={draft.passives.insight}
            onChange={(e) =>
              setDraft({
                ...draft,
                passives: { ...draft.passives, insight: num(e.target.value, 10) },
              })
            }
          />
        </label>
        <label className="field">
          Spell save DC
          <input
            type="number"
            value={draft.spellSaveDc ?? ''}
            onChange={(e) => {
              const { spellSaveDc: _drop, ...rest } = draft;
              setDraft(
                e.target.value === '' ? rest : { ...rest, spellSaveDc: num(e.target.value, 10) },
              );
            }}
          />
        </label>
      </div>
      <div className="row">
        <span className="muted">Saves</span>
        {ABILITIES.map((a) => (
          <label key={a} className="field inline">
            {a.toUpperCase()}
            <input
              type="number"
              className="narrow"
              value={draft.saves[a] ?? ''}
              onChange={(e) => {
                const saves = { ...draft.saves };
                if (e.target.value === '') delete saves[a];
                else saves[a] = num(e.target.value, 0);
                setDraft({ ...draft, saves });
              }}
            />
          </label>
        ))}
      </div>
      <label className="field">
        Notes
        <textarea
          rows={2}
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        />
      </label>
      <div className="row">
        <button type="submit" className="btn primary">
          Save
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function blankPc(): PCCard {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: '',
    name: '',
    playerName: '',
    classText: '',
    level: 1,
    maxHp: 10,
    ac: 10,
    initiativeBonus: 0,
    speed: 30,
    passives: { perception: 10, insight: 10, investigation: 10 },
    saves: {},
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

/** Campaign list, creation and PC cards (DESIGN.md §6.3). Adventures, notes and NPCs follow. */
export function CampaignPage() {
  const campaigns = useCampaignStore((s) => s.campaigns);
  const current = useCampaignStore((s) => s.current);
  const error = useCampaignStore((s) => s.error);
  const load = useCampaignStore((s) => s.load);
  const create = useCampaignStore((s) => s.create);
  const open = useCampaignStore((s) => s.open);
  const close = useCampaignStore((s) => s.close);
  const quickAdd = useCampaignStore((s) => s.quickAdd);
  const savePc = useCampaignStore((s) => s.savePc);
  const removePc = useCampaignStore((s) => s.removePc);
  const clearError = useCampaignStore((s) => s.clearError);
  const importXml = useCampaignStore((s) => s.importXml);
  const importing = useCampaignStore((s) => s.importing);
  const lastImport = useCampaignStore((s) => s.lastImport);
  const removeNote = useCampaignStore((s) => s.removeNote);
  const removeNpc = useCampaignStore((s) => s.removeNpc);
  const removeAdventure = useCampaignStore((s) => s.removeAdventure);

  const [newName, setNewName] = useState('');
  const [quick, setQuick] = useState('');
  const [editing, setEditing] = useState<PCCard | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="campaign">
      <h1>Campaign</h1>
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}

      {lastImport && (
        <p className="muted" data-testid="campaign-import-report">
          {lastImport.mode === 'new' ? 'Imported' : 'Merged'} {lastImport.name}:{' '}
          {lastImport.counts.pcs} PCs, {lastImport.counts.npcs} NPCs, {lastImport.counts.notes}{' '}
          notes, {lastImport.counts.adventures} adventures, {lastImport.counts.encounters}{' '}
          encounters
          {lastImport.counts.statBlocks
            ? `, ${lastImport.counts.statBlocks} inline stat blocks`
            : ''}
          {lastImport.warnings.length
            ? ` · ${lastImport.warnings.length} warnings: ${lastImport.warnings.join('; ')}`
            : ''}
        </p>
      )}

      {!current ? (
        <>
          <form
            className="card row"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) {
                void create(newName.trim());
                setNewName('');
              }
            }}
          >
            <input
              type="text"
              aria-label="New campaign name"
              placeholder="New campaign name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="btn primary">
              Create campaign
            </button>
            <button
              type="button"
              className="btn"
              disabled={importing}
              onClick={() => void importXml('new')}
            >
              Import campaign XML…
            </button>
          </form>
          <div className="card">
            <h2>Campaigns</h2>
            {campaigns.length === 0 ? (
              <p className="muted">No campaigns yet. Create one above.</p>
            ) : (
              campaigns.map((c) => (
                <div key={c.id} className="row">
                  <button type="button" className="btn" onClick={() => void open(c.id)}>
                    Open
                  </button>
                  <strong>{c.name}</strong>
                  <span className="muted">
                    {c.pcCount} PCs · {c.encounterCount} encounters · updated{' '}
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          <div className="row">
            <h2 className="campaign-title">{current.campaign.name}</h2>
            <span className="badge">{current.campaign.preferredEdition} rules</span>
            <span className="spacer" />
            <button
              type="button"
              className="btn"
              disabled={importing}
              onClick={() => void importXml('merge')}
            >
              Import into this campaign…
            </button>
            <button type="button" className="btn" onClick={() => void close()}>
              Close campaign
            </button>
          </div>

          <div className="card">
            <h2>Party</h2>
            {current.pcs.length === 0 && <p className="muted">No PC cards yet.</p>}
            {current.pcs.map((pc) =>
              editing?.id === pc.id ? (
                <PcEditor
                  key={pc.id}
                  pc={editing}
                  onSave={(p) => {
                    void savePc(p);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div key={pc.id} className="row pc-row" data-testid="pc-row">
                  <strong>{pc.name}</strong>
                  <span className="muted">
                    {pc.playerName ? `${pc.playerName} · ` : ''}
                    {pc.classText} {pc.level} · HP {pc.maxHp} · AC {pc.ac} · Init{' '}
                    {pc.initiativeBonus >= 0 ? '+' : ''}
                    {pc.initiativeBonus} · PP {pc.passives.perception}
                  </span>
                  <span className="spacer" />
                  <button type="button" className="btn" onClick={() => setEditing(pc)}>
                    Edit
                  </button>
                  <button type="button" className="btn" onClick={() => void removePc(pc.id)}>
                    Remove
                  </button>
                </div>
              ),
            )}
            {editing && !editing.id && (
              <PcEditor
                pc={editing}
                onSave={(p) => {
                  void savePc(p);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            )}
            <div className="row">
              <button type="button" className="btn" onClick={() => setEditing(blankPc())}>
                New PC card
              </button>
            </div>
            <h2 className="mt">Quick add</h2>
            <p className="muted">One PC per line: Name, Player, Class L, HP, AC, Init, Speed, PP</p>
            <textarea
              aria-label="Quick add"
              rows={3}
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              placeholder="Thora, Sam, Fighter 5, 44, 18, +1, 30, 12"
            />
            <div className="row">
              <button
                type="button"
                className="btn primary"
                disabled={!quick.trim()}
                onClick={() => {
                  void quickAdd(quick).then(() => setQuick(''));
                }}
              >
                Add PCs
              </button>
            </div>
          </div>

          <div className="card">
            <h2>Adventures</h2>
            {current.adventures.length === 0 && <p className="muted">No adventures yet.</p>}
            {current.adventures.map((a) => (
              <div key={a.id} className="entity-row" data-testid="adventure-row">
                <div className="row">
                  <strong>{a.name}</strong>
                  <span className="muted">
                    {a.encounterIds.length} encounters · {a.noteIds.length} notes
                  </span>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="btn tiny"
                    onClick={() => void removeAdventure(a.id)}
                  >
                    Remove
                  </button>
                </div>
                {a.summary && <p className="muted">{a.summary}</p>}
              </div>
            ))}
          </div>

          <div className="card">
            <h2>NPCs</h2>
            {current.npcs.length === 0 && <p className="muted">No NPCs yet.</p>}
            {current.npcs.map((n) => (
              <div key={n.id} className="entity-row" data-testid="npc-row">
                <div className="row">
                  <strong>{n.name}</strong>
                  {n.role && <span className="muted">{n.role}</span>}
                  {n.location && <span className="muted">· {n.location}</span>}
                  {n.recordRef && <span className="badge">stat block</span>}
                  {!n.isAlive && <span className="badge">dead</span>}
                  <span className="spacer" />
                  <button type="button" className="btn tiny" onClick={() => void removeNpc(n.id)}>
                    Remove
                  </button>
                </div>
                {n.notes && <p className="muted">{n.notes}</p>}
              </div>
            ))}
          </div>

          <div className="card">
            <h2>Notes</h2>
            {current.notes.length === 0 && <p className="muted">No notes yet.</p>}
            {current.notes.map((n) => (
              <details key={n.id} className="entity-row" data-testid="note-row">
                <summary>
                  <strong>{n.title}</strong>
                </summary>
                <pre className="source-text">{n.body}</pre>
                <button type="button" className="btn tiny" onClick={() => void removeNote(n.id)}>
                  Remove
                </button>
              </details>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
