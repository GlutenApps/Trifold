import { useEffect, useState } from 'react';
import type { MonsterRecord, NPC, PCCard } from '@trifold/schema';
import { landOn, navKey, useNavTarget } from '../../navigate';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { useShellStore } from '../../stores/shellStore';
import { StatBlock } from '../compendium/StatBlock';
import { Icon } from '../shell/icons';
import { CampaignNotes } from './CampaignNotes';
import { InlineConfirm } from '../shell/InlineConfirm';
import { useSourcesStore } from '../../stores/sourcesStore';
import { AddNpcPanel } from './AddNpcPanel';
import { blankNpc, blankPc, CopyFromCampaign, NpcEditor, PcEditor } from './CharacterEditors';

/**
 * Where an NPC's stat block lives, in ADR 0037's words: this campaign only, the DM's homebrew
 * for all campaigns, or the book or file it came from.
 */
export function statBlockHome(sourceId: string, sourceNames: ReadonlyMap<string, string>): string {
  if (sourceId.startsWith('campaign:')) return 'This campaign';
  if (sourceId === 'homebrew') return 'Homebrew';
  return sourceNames.get(sourceId) ?? 'Compendium';
}

/**
 * The Campaign major (DESIGN.md §6.3). `CampaignPage` at the end of the file is the tab;
 * before it come the PC card editor and the Party and NPCs sub-tabs, which show the HP carried
 * between fights with Long rest and Restore (ADR 0012). The Notes sub-tab lives in
 * CampaignNotes.tsx (ADR 0010).
 */
type CampaignTab = 'party' | 'npcs' | 'notes';

/** What the Party and NPCs tabs show: their list, a form in its place, or the copy picker. */
type TabView<T> = { kind: 'list' } | { kind: 'edit'; item: T; key: number } | { kind: 'copy' };

/** The Party tab's header buttons: copy from another campaign, then New. NPCs use Add NPC. */
function AddButtons({ what, onCopy, onNew }: { what: 'PC'; onCopy(): void; onNew(): void }) {
  const newLabel = 'New PC card';
  return (
    <>
      <button
        type="button"
        className="btn"
        aria-label={`Copy a ${what} from another campaign`}
        title={`Copy a ${what} from another campaign`}
        onClick={onCopy}
      >
        <Icon name="plus" />
        From another campaign…
      </button>
      <button
        type="button"
        className="chrome-btn primary"
        aria-label={newLabel}
        title={newLabel}
        onClick={onNew}
      >
        <Icon name="plus" />
      </button>
    </>
  );
}

function PartyTab() {
  const current = useCampaignStore((s) => s.current);
  const savePc = useCampaignStore((s) => s.savePc);
  const copyPc = useCampaignStore((s) => s.copyPc);
  const removePc = useCampaignStore((s) => s.removePc);
  const [view, setView] = useState<TabView<PCCard>>({ kind: 'list' });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (!current) return null;
  const toList = (landId?: string) => {
    setView({ kind: 'list' });
    if (landId) landOn(navKey('pc', landId));
  };

  if (view.kind === 'edit') {
    return (
      <PcEditor
        key={view.key}
        pc={view.item}
        onCancel={() => toList()}
        onSave={(pc, another) => {
          void savePc(pc).then((saved) => {
            if (!saved) return;
            if (another) setView({ kind: 'edit', item: blankPc(), key: view.key + 1 });
            else toList(saved.id);
          });
        }}
      />
    );
  }
  if (view.kind === 'copy') {
    return (
      <CopyFromCampaign
        kind="pc"
        currentCampaignId={current.campaign.id}
        onBack={() => toList()}
        onCopy={(campaignId, id) => {
          void copyPc(campaignId, id).then((copied) => {
            if (copied) toList(copied.id);
          });
        }}
      />
    );
  }

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
        <AddButtons
          what="PC"
          onCopy={() => setView({ kind: 'copy' })}
          onNew={() => setView({ kind: 'edit', item: blankPc(), key: 0 })}
        />
      </div>
      {current.pcs.length === 0 && <p className="muted">No PC cards yet.</p>}
      {current.pcs.map((pc) => (
        <div key={pc.id} className="row pc-row" data-testid="pc-row" data-nav={navKey('pc', pc.id)}>
          <strong>{pc.name}</strong>
          <span className="muted">
            {pc.playerName ? `${pc.playerName} · ` : ''}
            {pc.classText ? `${pc.classText} ${pc.level} · ` : ''}
            HP {pc.currentHp ?? pc.maxHp}/{pc.maxHp}
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
                onClick={() => setView({ kind: 'edit', item: pc, key: 0 })}
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
      ))}
    </div>
  );
}

/**
 * An NPC's linked stat block, shown under its row. Fetched when opened, so a long NPC list costs
 * nothing until the DM asks.
 */
function NpcStatBlock({ npc }: { npc: NPC }) {
  const recordId = npc.recordRef?.recordId;
  const [record, setRecord] = useState<MonsterRecord | null | undefined>(undefined);
  const openRecord = useCompendiumStore((s) => s.openRecord);
  const openByKey = useCompendiumStore((s) => s.openByKey);
  const openMajor = useShellStore((s) => s.openMajor);
  useEffect(() => {
    if (!recordId) return;
    let live = true;
    setRecord(undefined);
    void window.trifold.compendium
      .get(recordId)
      .catch(() => null)
      .then((found) => {
        if (live) setRecord(found?.kind === 'monster' ? found : null);
      });
    return () => {
      live = false;
    };
  }, [recordId]);
  if (!recordId) return null;
  if (record === undefined) return <p className="muted npc-statblock">Loading stat block…</p>;
  if (record === null) {
    return (
      <p className="muted npc-statblock">
        The linked stat block is not in the compendium any more ({npc.recordRef?.key}).
      </p>
    );
  }
  return (
    <div className="npc-statblock">
      <div className="row">
        <span className="spacer" />
        <button
          type="button"
          className="btn"
          onClick={() => {
            void openRecord(record.id).then(
              (ok) => ok && openMajor('compendium', { avoid: 'campaign' }),
            );
          }}
        >
          <Icon name="external" />
          Open stat block
        </button>
      </div>
      <StatBlock
        record={record}
        onOpenSpell={(key) => {
          void openByKey('spell', key).then(
            (ok) => ok && openMajor('compendium', { avoid: 'campaign' }),
          );
        }}
      />
    </div>
  );
}

function NpcsTab() {
  const current = useCampaignStore((s) => s.current);
  const removeNpc = useCampaignStore((s) => s.removeNpc);
  const saveNpc = useCampaignStore((s) => s.saveNpc);
  const copyNpc = useCampaignStore((s) => s.copyNpc);
  const npcFromRecord = useCampaignStore((s) => s.npcFromRecord);
  const sources = useSourcesStore((s) => s.sources);
  const loadSources = useSourcesStore((s) => s.load);
  const [view, setView] = useState<TabView<NPC>>({ kind: 'list' });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  const hasSources = sources.length > 0;
  useEffect(() => {
    if (!hasSources) void loadSources();
  }, [hasSources, loadSources]);
  const sourceNames = new Map(sources.map((s) => [s.id, s.name]));
  if (!current) return null;
  const toList = (landId?: string) => {
    setView({ kind: 'list' });
    if (landId) landOn(navKey('npc', landId));
  };

  if (view.kind === 'edit') {
    return (
      <NpcEditor
        key={view.key}
        npc={view.item}
        onCancel={() => toList()}
        onSave={(npc, another) => {
          void saveNpc(npc).then((saved) => {
            if (!saved) return;
            if (another) setView({ kind: 'edit', item: blankNpc(), key: view.key + 1 });
            else toList(saved.id);
          });
        }}
      />
    );
  }
  if (view.kind === 'copy') {
    return (
      <AddNpcPanel
        currentCampaignId={current.campaign.id}
        onBack={() => toList()}
        onBlank={() => setView({ kind: 'edit', item: blankNpc(), key: 0 })}
        onCopy={(campaignId, id) => {
          void copyNpc(campaignId, id).then((copied) => {
            if (copied) toList(copied.id);
          });
        }}
        onFromRecord={(recordId) => {
          void npcFromRecord(recordId).then((made) => {
            if (made) toList(made.id);
          });
        }}
      />
    );
  }

  return (
    <div className="card">
      <div className="row">
        <h2>NPCs</h2>
        <span className="spacer" />
        <button
          type="button"
          className="chrome-btn primary"
          aria-label="Add NPC"
          title="Add NPC: blank, from another campaign or from the compendium"
          onClick={() => setView({ kind: 'copy' })}
        >
          <Icon name="plus" />
        </button>
      </div>
      {current.npcs.length === 0 && <p className="muted">No NPCs yet.</p>}
      {current.npcs.map((n) => (
        <div key={n.id} className="entity-row" data-testid="npc-row" data-nav={navKey('npc', n.id)}>
          <div className="row">
            <strong>{n.name}</strong>
            {n.role && <span className="muted">{n.role}</span>}
            {n.location && <span className="muted">· {n.location}</span>}
            {n.hp && (
              <span className="muted" title="HP carried from the last fight">
                HP {n.hp.current}/{n.hp.max}
                {n.hp.temp > 0 ? ` +${n.hp.temp}` : ''}
              </span>
            )}
            {!n.isAlive && <span className="badge">dead</span>}
            {n.recordRef && (
              <span
                className="badge source-pill"
                data-testid="npc-statblock-home"
                title="Where its stat block lives"
              >
                Stat block: {statBlockHome(n.recordRef.sourceId, sourceNames)}
              </span>
            )}
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
                {n.recordRef && (
                  <button
                    type="button"
                    className="chrome-btn xs"
                    aria-label={`Stat block for ${n.name}`}
                    aria-pressed={shownId === n.id}
                    title={shownId === n.id ? 'Hide stat block' : 'Show stat block'}
                    onClick={() => setShownId((id) => (id === n.id ? null : n.id))}
                  >
                    <Icon name="tome" />
                  </button>
                )}
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
                  className="chrome-btn xs"
                  aria-label={`Edit ${n.name}`}
                  title="Edit"
                  onClick={() => setView({ kind: 'edit', item: n, key: 0 })}
                >
                  <Icon name="pencil" />
                </button>
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
          {shownId === n.id && <NpcStatBlock npc={n} />}
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

  // Deep links (ADR 0017): pick the sub-tab. NPC and PC rows land here; a note or folder is
  // landed by the Notes sub-tab once it is showing.
  useNavTarget(['note', 'folder', 'npc', 'pc'], (target) => {
    setTab(target.type === 'npc' ? 'npcs' : target.type === 'pc' ? 'party' : 'notes');
    if (target.type === 'npc' || target.type === 'pc') {
      landOn(navKey(target.type, target.id));
      return true;
    }
    return false;
  });

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
              title="Merge a Game Master campaign XML, or a Fight Club GM export, into this campaign"
              onClick={() => void importXml('merge')}
            >
              Import Game Master XML…
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
