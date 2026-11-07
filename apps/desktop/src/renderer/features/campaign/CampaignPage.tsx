import { useEffect, useState } from 'react';
import type { PCCard } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { Icon } from '../shell/icons';
import { CampaignNotes } from './CampaignNotes';
import { InlineConfirm } from '../shell/InlineConfirm';

/**
 * The Campaign major (DESIGN.md §6.3). `CampaignPage` at the end of the file is the tab;
 * before it come the PC card editor and the Party and NPCs sub-tabs, which show the HP carried
 * between fights with Long rest and Restore (ADR 0012). The Notes sub-tab lives in
 * CampaignNotes.tsx (ADR 0010).
 */
const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

/** A number field's text as an integer, or `fallback` when it does not parse. */
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
        <label className="field">
          Current HP
          <input
            type="number"
            placeholder="full"
            value={draft.currentHp ?? ''}
            onChange={(e) => {
              const { currentHp: _was, ...rest } = draft;
              setDraft(
                e.target.value === ''
                  ? rest
                  : { ...rest, currentHp: Math.max(0, num(e.target.value, 0)) },
              );
            }}
          />
        </label>
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

/** A new PC card with starting values and a blank id, which main fills in on save. */
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

type CampaignTab = 'party' | 'npcs' | 'notes';

function PartyTab() {
  const current = useCampaignStore((s) => s.current);
  const quickAdd = useCampaignStore((s) => s.quickAdd);
  const savePc = useCampaignStore((s) => s.savePc);
  const removePc = useCampaignStore((s) => s.removePc);
  const [quick, setQuick] = useState('');
  const [editing, setEditing] = useState<PCCard | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (!current) return null;
  const wounded = current.pcs.filter(
    (pc) => (pc.currentHp !== undefined && pc.currentHp < pc.maxHp) || (pc.tempHp ?? 0) > 0,
  );
  const longRest = async () => {
    for (const pc of wounded) {
      const { currentHp: _spent, ...rested } = pc;
      await savePc({ ...rested, tempHp: 0 });
    }
  };
  return (
    <div className="card">
      <div className="row">
        <h2>Party</h2>
        <span className="spacer" />
        <button
          type="button"
          className="btn"
          disabled={wounded.length === 0}
          title="Everyone back to full HP, temp HP gone"
          onClick={() => void longRest()}
        >
          Long rest
        </button>
      </div>
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
              {pc.classText} {pc.level} · HP {pc.currentHp ?? pc.maxHp}/{pc.maxHp}
              {(pc.tempHp ?? 0) > 0 ? ` +${pc.tempHp}` : ''} · AC {pc.ac} · Init{' '}
              {pc.initiativeBonus >= 0 ? '+' : ''}
              {pc.initiativeBonus} · PP {pc.passives.perception}
            </span>
            <span className="spacer" />
            {confirmId === pc.id ? (
              <InlineConfirm
                name={pc.name}
                onConfirm={() => {
                  setConfirmId(null);
                  void removePc(pc.id);
                }}
                onKeep={() => setConfirmId(null)}
              />
            ) : (
              <span className="row-actions">
                <button
                  type="button"
                  className="chrome-btn xs"
                  aria-label={`Edit ${pc.name}`}
                  title="Edit"
                  onClick={() => setEditing(pc)}
                >
                  <Icon name="pencil" />
                </button>
                <button
                  type="button"
                  className="chrome-btn xs danger"
                  aria-label={`Delete ${pc.name}`}
                  title="Delete"
                  onClick={() => setConfirmId(pc.id)}
                >
                  <Icon name="trash" />
                </button>
              </span>
            )}
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
  );
}

function NpcsTab() {
  const current = useCampaignStore((s) => s.current);
  const removeNpc = useCampaignStore((s) => s.removeNpc);
  const saveNpc = useCampaignStore((s) => s.saveNpc);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (!current) return null;
  return (
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
            {n.hp && (
              <span className="muted" title="HP carried from the last fight">
                HP {n.hp.current}/{n.hp.max}
                {n.hp.temp > 0 ? ` +${n.hp.temp}` : ''}
              </span>
            )}
            {!n.isAlive && <span className="badge">dead</span>}
            <span className="spacer" />
            {confirmId === n.id ? (
              <InlineConfirm
                name={n.name}
                onConfirm={() => {
                  setConfirmId(null);
                  void removeNpc(n.id);
                }}
                onKeep={() => setConfirmId(null)}
              />
            ) : (
              <span className="row-actions">
                {n.hp && (n.hp.current < n.hp.max || n.hp.temp > 0 || !n.isAlive) && (
                  <button
                    type="button"
                    className="chrome-btn xs"
                    aria-label={`Restore ${n.name}`}
                    title="Restore: back to full HP and alive"
                    onClick={() =>
                      void saveNpc({
                        ...n,
                        hp: { current: n.hp!.max, max: n.hp!.max, temp: 0 },
                        isAlive: true,
                      })
                    }
                  >
                    <Icon name="refresh" />
                  </button>
                )}
                <button
                  type="button"
                  className="chrome-btn xs danger"
                  aria-label={`Delete ${n.name}`}
                  title="Delete"
                  onClick={() => setConfirmId(n.id)}
                >
                  <Icon name="trash" />
                </button>
              </span>
            )}
          </div>
          {n.notes && <p className="muted">{n.notes}</p>}
        </div>
      ))}
    </div>
  );
}

/**
 * The Campaign major (DESIGN.md §6.3): the open campaign's header, then Party, NPCs and Notes as
 * sub-tabs. Notes fills the panel (ADR 0010); adventures are folders in that tree now.
 */
export function CampaignPage() {
  const current = useCampaignStore((s) => s.current);
  const error = useCampaignStore((s) => s.error);
  const load = useCampaignStore((s) => s.load);
  const clearError = useCampaignStore((s) => s.clearError);
  const importXml = useCampaignStore((s) => s.importXml);
  const importing = useCampaignStore((s) => s.importing);
  const lastImport = useCampaignStore((s) => s.lastImport);
  const [tab, setTab] = useState<CampaignTab>('party');

  useEffect(() => {
    void load();
  }, [load]);

  const tabs: [CampaignTab, string][] = current
    ? [
        ['party', `Party (${current.pcs.length})`],
        ['npcs', `NPCs (${current.npcs.length})`],
        ['notes', `Notes (${current.notes.filter((n) => n.kind !== 'folder').length})`],
      ]
    : [];

  return (
    <section className={`campaign${current && tab === 'notes' ? ' fill' : ''}`}>
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn small" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}

      {lastImport && (
        <p className="muted" data-testid="campaign-import-report">
          {lastImport.mode === 'new' ? 'Imported' : 'Merged'} {lastImport.name}:{' '}
          {lastImport.counts.pcs} PCs, {lastImport.counts.npcs} NPCs, {lastImport.counts.notes}{' '}
          notes, {lastImport.counts.adventures} adventure folders, {lastImport.counts.encounters}{' '}
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
        <p className="muted">Open a campaign from the Library.</p>
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
          </div>

          <div className="subtabbar">
            <div className="subtablist" role="tablist" aria-label="Campaign view">
              {tabs.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  className={`subtab${tab === id ? ' active' : ''}`}
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {tab === 'party' && <PartyTab />}
          {tab === 'npcs' && <NpcsTab />}
          {tab === 'notes' && <CampaignNotes notes={current.notes} />}
        </>
      )}
    </section>
  );
}
