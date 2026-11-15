import { useCallback, useEffect, useMemo, useState } from 'react';
import { libraryUrl, mediaUrl, type ArtFolderFile } from '@trifold/api';
import { errorMessage } from '@trifold/schema';
import { useArtStore } from '../../stores/artStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { ArtThumb } from '../shell/ArtThumb';
import { Icon } from '../shell/icons';
import { InlineConfirm } from '../shell/InlineConfirm';
import { matchArtFiles, type ArtMatch } from './artMatch';

/**
 * Library › Images (ADR 0033): everything that can be a token, to see what still needs art and
 * add it. Compendium creatures (art shared by every source and edition, in every campaign) and
 * every campaign's PCs and NPCs (their portrait). Add from folder matches files to creatures by
 * name and shows the matches and misses before adding anything.
 */
type RowKind = 'creature' | 'pc' | 'npc';

interface Row {
  id: string;
  kind: RowKind;
  name: string;
  /** Creature type, or the campaign's name for a PC or NPC. */
  detail: string;
  source: string;
  campaignId?: string;
  /** The creature's key, or a character's id. */
  key: string;
  url: string | undefined;
  /** An NPC showing its stat block's art rather than its own portrait. */
  borrowed?: boolean;
  /** An NPC's stat block key, whose art it shows without a portrait. */
  statBlock?: string;
}

const PAGE = 100;
const KIND_LABEL: Record<RowKind, string> = { creature: 'Creature', pc: 'PC', npc: 'NPC' };

export function ImagesPage() {
  const byKey = useArtStore((s) => s.byKey);
  const setCreature = useArtStore((s) => s.setCreature);
  const removeCreature = useArtStore((s) => s.removeCreature);
  const storeError = useArtStore((s) => s.error);
  const clearStoreError = useArtStore((s) => s.clearError);
  const openCampaignId = useCampaignStore((s) => s.current?.campaign.id ?? null);
  const [creatures, setCreatures] = useState<
    Array<{ key: string; name: string; type: string; source: string }>
  >([]);
  const [characters, setCharacters] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<RowKind | ''>('');
  const [needsArt, setNeedsArt] = useState(false);
  const [source, setSource] = useState('');
  const [campaign, setCampaign] = useState('');
  const [type, setType] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [folder, setFolder] = useState<{ matches: ArtMatch[]; misses: ArtFolderFile[] } | null>(
    null,
  );

  useEffect(() => {
    void window.trifold.compendium
      .search({ kind: 'monster', limit: 2000, collapse: true })
      .then((r) =>
        setCreatures(
          r.rows.map((row) => ({
            key: row.key,
            name: row.displayName,
            type: row.type ?? '',
            source: row.sourceName,
          })),
        ),
      )
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  const loadCharacters = useCallback(async () => {
    try {
      const bundles = await window.trifold.campaigns.bundles();
      const rows: Row[] = [];
      for (const b of bundles) {
        const slug = b.campaign.slug;
        for (const pc of b.pcs) {
          rows.push({
            id: `pc:${b.campaign.id}:${pc.id}`,
            kind: 'pc',
            name: pc.name,
            detail: b.campaign.name,
            source: '',
            campaignId: b.campaign.id,
            key: pc.id,
            url: pc.portrait ? mediaUrl(slug, pc.portrait) : undefined,
          });
        }
        for (const npc of b.npcs) {
          rows.push({
            id: `npc:${b.campaign.id}:${npc.id}`,
            kind: 'npc',
            name: npc.name,
            detail: b.campaign.name,
            source: '',
            campaignId: b.campaign.id,
            key: npc.id,
            url: npc.portrait ? mediaUrl(slug, npc.portrait) : undefined,
            ...(npc.portrait || !npc.recordRef
              ? {}
              : { borrowed: true, statBlock: npc.recordRef.key }),
          });
        }
      }
      setCharacters(rows);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => {
    void loadCharacters();
  }, [loadCharacters]);

  const rows: Row[] = useMemo(() => {
    const artUrl = (key: string) => {
      const art = byKey[`monster:${key}`];
      return art ? libraryUrl(art.path, art.version) : undefined;
    };
    const creatureRows: Row[] = creatures.map((c) => ({
      id: `creature:${c.key}`,
      kind: 'creature',
      name: c.name,
      detail: c.type,
      source: c.source,
      key: c.key,
      url: artUrl(c.key),
    }));
    // An NPC without a portrait shows its stat block's art, marked as borrowed.
    const characterRows = (characters ?? []).map((r) =>
      r.borrowed && r.statBlock ? { ...r, url: artUrl(r.statBlock) } : r,
    );
    return [...creatureRows, ...characterRows].sort((a, b) => a.name.localeCompare(b.name));
  }, [creatures, characters, byKey]);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (!kind || r.kind === kind) &&
      (!needsArt || !r.url || r.borrowed) &&
      (!source || r.source === source) &&
      (!campaign || r.campaignId === campaign) &&
      (!type || r.detail === type) &&
      (!q || r.name.toLowerCase().includes(q)),
  );
  const sources = [...new Set(creatures.map((c) => c.source))].sort();
  const types = [...new Set(creatures.map((c) => c.type).filter(Boolean))].sort();
  const campaigns = [
    ...new Map((characters ?? []).map((r) => [r.campaignId!, r.detail])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const missing = rows.filter((r) => !r.url).length;

  const setFor = async (r: Row) => {
    setError(null);
    try {
      if (r.kind === 'creature') {
        await setCreature('monster', r.key);
      } else if (await window.trifold.art.setCharacter(r.campaignId!, r.kind, r.key)) {
        await afterCharacterChange(r);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const removeFor = async (r: Row) => {
    setConfirm(null);
    setError(null);
    try {
      if (r.kind === 'creature') await removeCreature('monster', r.key);
      else {
        await window.trifold.art.removeCharacter(r.campaignId!, r.kind, r.key);
        await afterCharacterChange(r);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  /** A character's portrait changed: re-read the list, and the open campaign when it is theirs. */
  const afterCharacterChange = async (r: Row) => {
    await loadCharacters();
    if (r.campaignId === openCampaignId) await useCampaignStore.getState().refreshCharacters();
  };

  const chooseFolder = async () => {
    setError(null);
    try {
      const files = await window.trifold.art.chooseFolder();
      if (!files) return;
      const known = new Map(
        creatures.map((c) => [c.key, { name: c.name, hasArt: !!byKey[`monster:${c.key}`] }]),
      );
      setFolder(matchArtFiles(files, known));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <section className="images-page" aria-label="Images">
      <div className="row">
        <h1>Images</h1>
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => void chooseFolder()}>
          <Icon name="folder" />
          Add from folder…
        </button>
      </div>
      <p className="muted">
        Art for every creature, PC and NPC that can be a token. A creature&rsquo;s art shows on
        every token of it in every campaign and on its compendium page; a PC&rsquo;s or NPC&rsquo;s
        on its card and its tokens. Pictures are fitted to 512 px as they come in.{' '}
        {missing > 0 && <span data-testid="images-missing">{missing} still need art.</span>}
      </p>
      {(error ?? storeError) && (
        <div className="banner error" role="alert">
          <span>{error ?? storeError}</span>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setError(null);
              clearStoreError();
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {folder && (
        <FolderPreview
          folder={folder}
          onCancel={() => setFolder(null)}
          onDone={() => setFolder(null)}
          onAdd={async (m) => {
            await setCreature('monster', m.key, m.file.path);
          }}
        />
      )}

      <div className="row filters images-filters">
        <input
          type="text"
          aria-label="Find by name"
          placeholder="Find by name"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
        />
        <select
          aria-label="Kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as RowKind | '')}
        >
          <option value="">Creatures, PCs and NPCs</option>
          <option value="creature">Creatures</option>
          <option value="pc">PCs</option>
          <option value="npc">NPCs</option>
        </select>
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Any type</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label="Campaign"
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
        >
          <option value="">All campaigns</option>
          {campaigns.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={needsArt}
            onChange={(e) => setNeedsArt(e.target.checked)}
          />
          Needs art
        </label>
      </div>

      <p className="muted small">
        {filtered.length.toLocaleString()} {filtered.length === 1 ? 'entry' : 'entries'}
      </p>
      <ul className="images-list">
        {filtered.slice(0, shown).map((r) => (
          <li key={r.id} className="images-row" data-testid="images-row">
            <span className="images-thumb">
              {r.url ? (
                <ArtThumb url={r.url} label={r.name} />
              ) : (
                <span className="art-thumb small empty" aria-hidden="true" />
              )}
            </span>
            <span className="images-name">
              <strong>{r.name}</strong>
              <span className="muted small">
                {[KIND_LABEL[r.kind], r.detail, r.source, r.borrowed ? 'from its stat block' : '']
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <span className="spacer" />
            {confirm === r.id ? (
              <InlineConfirm
                name={r.name}
                verb="Remove"
                question={`Remove ${r.name}'s art?`}
                onConfirm={() => void removeFor(r)}
                onKeep={() => setConfirm(null)}
              />
            ) : (
              <span className="row-actions">
                <button
                  type="button"
                  className="chrome-btn xs"
                  aria-label={`${r.url && !r.borrowed ? 'Replace' : 'Add'} art for ${r.name}`}
                  title={r.url && !r.borrowed ? 'Replace the art' : 'Add art'}
                  onClick={() => void setFor(r)}
                >
                  <Icon name={r.url && !r.borrowed ? 'refresh' : 'plus'} />
                </button>
                {r.url && !r.borrowed && (
                  <button
                    type="button"
                    className="chrome-btn xs danger"
                    aria-label={`Remove art for ${r.name}`}
                    title="Remove the art"
                    onClick={() => setConfirm(r.id)}
                  >
                    <Icon name="trash" />
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      {filtered.length > shown && (
        <button type="button" className="btn" onClick={() => setShown(shown + PAGE)}>
          Show {Math.min(PAGE, filtered.length - shown)} more
        </button>
      )}
    </section>
  );
}

/** What Add from folder found, before anything is added. */
function FolderPreview({
  folder,
  onAdd,
  onCancel,
  onDone,
}: {
  folder: { matches: ArtMatch[]; misses: ArtFolderFile[] };
  onAdd(match: ArtMatch): Promise<void>;
  onCancel(): void;
  onDone(): void;
}) {
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const todo = folder.matches.filter((m) => replace || !m.hasArt);
  const run = async () => {
    setBusy({ done: 0, total: todo.length });
    for (const [i, m] of todo.entries()) {
      await onAdd(m);
      setBusy({ done: i + 1, total: todo.length });
    }
    onDone();
  };
  return (
    <div className="books-panel images-folder" role="group" aria-label="Add from folder">
      <div className="books-panel-head">
        <strong>
          {folder.matches.length} {folder.matches.length === 1 ? 'match' : 'matches'} ·{' '}
          {folder.misses.length} not matched
        </strong>
      </div>
      {folder.matches.length > 0 && (
        <ul className="images-matches">
          {folder.matches.map((m) => (
            <li key={m.file.path} className={!replace && m.hasArt ? 'muted' : undefined}>
              {m.file.name} → <strong>{m.name}</strong>
              {m.hasArt && (
                <span className="badge">{replace ? 'replaces art' : 'has art, kept'}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {folder.misses.length > 0 && (
        <details>
          <summary className="muted small">Not matched: name the files after the creature</summary>
          <p className="muted small">{folder.misses.map((f) => f.name).join(', ')}</p>
        </details>
      )}
      <label className="check">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        Replace art that is already set
      </label>
      <div className="books-panel-foot">
        <button type="button" className="btn" onClick={onCancel} disabled={!!busy}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={todo.length === 0 || !!busy}
          onClick={() => void run()}
        >
          {busy ? `Adding ${busy.done} of ${busy.total}…` : `Add ${todo.length}`}
        </button>
      </div>
    </div>
  );
}
