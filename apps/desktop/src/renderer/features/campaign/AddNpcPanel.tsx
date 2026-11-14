import { useEffect, useMemo, useRef, useState } from 'react';
import type { CompendiumRow } from '@trifold/api';
import { Icon } from '../shell/icons';
import { useOtherCampaignRows } from './CharacterEditors';

/**
 * Add an NPC (ADR 0037): the one place a campaign gains an NPC by hand. Start a blank one, or
 * find one to copy: an NPC from another campaign (copied as it is, its stat block brought along
 * when needed, ADR 0036), or a creature from the compendium, which becomes a named NPC in this
 * campaign with its own copy of the stat block, so it can be changed without touching the
 * original; the NPC form opens on it next. The compendium list loads a page at a time.
 */
type Mode = 'campaigns' | 'compendium';

const SEARCH_DELAY_MS = 150;
/** Creatures fetched at a time; more load as the list's end scrolls into view. */
export const CREATURE_PAGE = 100;

/** The compendium's creatures for a search, a page at a time, with how many match in all. */
function useCompendiumCreatures(query: string, namedOnly: boolean, active: boolean) {
  const [rows, setRows] = useState<CompendiumRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(CREATURE_PAGE);
  // A new search starts from the first page.
  useEffect(() => setLimit(CREATURE_PAGE), [query, namedOnly]);
  useEffect(() => {
    if (!active) return;
    let live = true;
    const timer = setTimeout(() => {
      void window.trifold.compendium
        .search({
          kind: 'monster',
          text: query.trim() || undefined,
          npc: namedOnly ? 'only' : 'any',
          limit,
        })
        .then((result) => {
          if (!live) return;
          setRows(result.rows);
          setTotal(result.total);
        })
        .catch(() => live && setRows([]));
    }, SEARCH_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, namedOnly, active, limit]);
  const more = rows !== null && rows.length < total;
  return {
    rows,
    total,
    more,
    showMore: () => setLimit((n) => (rows && rows.length >= n ? n + CREATURE_PAGE : n)),
  };
}

/** Loads the next page when the end of the list scrolls into view (and on click). */
function MoreRow({ shown, total, onMore }: { shown: number; total: number; onMore(): void }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const watch = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onMore();
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, [onMore, shown]);
  return (
    <li ref={ref} className="picker-more">
      <span className="muted small">
        Showing {shown} of {total}
      </span>
      <button type="button" className="btn" onClick={onMore}>
        Show more
      </button>
    </li>
  );
}

export function AddNpcPanel({
  currentCampaignId,
  onBlank,
  onCopy,
  onFromRecord,
  onBack,
}: {
  currentCampaignId: string;
  onBlank(): void;
  onCopy(campaignId: string, npcId: string): void;
  onFromRecord(recordId: string): void;
  onBack(): void;
}) {
  const [mode, setMode] = useState<Mode>('campaigns');
  const [query, setQuery] = useState('');
  const [namedOnly, setNamedOnly] = useState(false);
  const npcs = useOtherCampaignRows('npc', currentCampaignId);
  const found = useCompendiumCreatures(query, namedOnly, mode === 'compendium');
  const creatures = found.rows;

  const shownNpcs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (npcs ?? []).filter(
      (r) => !q || r.name.toLowerCase().includes(q) || r.campaignName.toLowerCase().includes(q),
    );
  }, [npcs, query]);

  return (
    <div className="copy-from-campaign add-npc" aria-label="Add an NPC">
      <div className="row">
        <button
          type="button"
          className="chrome-btn"
          aria-label="Back to NPCs"
          title="Back to NPCs"
          onClick={onBack}
        >
          <Icon name="left" />
        </button>
        <h2>Add an NPC</h2>
        <span className="spacer" />
        <button type="button" className="btn" onClick={onBlank}>
          <Icon name="plus" />
          Start a blank NPC
        </button>
      </div>
      <div className="row">
        <span className="seg" role="group" aria-label="Find an NPC in">
          <button
            type="button"
            className="btn"
            aria-pressed={mode === 'campaigns'}
            onClick={() => setMode('campaigns')}
          >
            Other campaigns
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={mode === 'compendium'}
            onClick={() => setMode('compendium')}
          >
            Compendium
          </button>
        </span>
        {mode === 'compendium' && (
          <label>
            <input
              type="checkbox"
              checked={namedOnly}
              onChange={(e) => setNamedOnly(e.target.checked)}
            />
            Named characters only
          </label>
        )}
      </div>
      <p className="muted" data-testid="add-npc-hint">
        {mode === 'campaigns'
          ? 'Copies the NPC into this campaign, alive and at full HP. The original stays as it is.'
          : 'Makes a named NPC in this campaign with its own copy of the stat block, kept in this campaign only. Change it freely; the original stays as it is.'}
      </p>
      <input
        type="text"
        aria-label={mode === 'campaigns' ? 'Find an NPC' : 'Find a creature'}
        placeholder={mode === 'campaigns' ? 'Find by name or campaign…' : 'Find by name…'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {mode === 'campaigns' ? (
        npcs === null ? (
          <p className="muted">Loading…</p>
        ) : npcs.length === 0 ? (
          <p className="muted">No other campaign has NPCs yet.</p>
        ) : shownNpcs.length === 0 ? (
          <p className="muted">Nothing matches.</p>
        ) : (
          <ul className="picker-list">
            {shownNpcs.map((r) => (
              <li key={`${r.campaignId}/${r.id}`} data-testid="copy-row">
                <span>
                  <strong>{r.name}</strong>{' '}
                  <span className="muted small">
                    {[r.detail, r.campaignName].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <button
                  type="button"
                  className="chrome-btn xs"
                  aria-label={`Copy ${r.name} from ${r.campaignName}`}
                  title="Copy into this campaign"
                  onClick={() => onCopy(r.campaignId, r.id)}
                >
                  <Icon name="plus" />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : creatures === null ? (
        <p className="muted">Loading…</p>
      ) : creatures.length === 0 ? (
        <p className="muted">Nothing matches.</p>
      ) : (
        <ul className="picker-list">
          {creatures.map((r) => (
            <li key={r.id} data-testid="creature-row">
              <span>
                <strong>{r.displayName}</strong>{' '}
                <span className="muted small">
                  {[r.cr !== null ? `CR ${r.cr}` : '', r.type ?? ''].filter(Boolean).join(' · ')}
                </span>{' '}
                {r.isNpc && <span className="badge">Named</span>}{' '}
                <span className="badge source-pill">{r.sourceName}</span>
              </span>
              <button
                type="button"
                className="chrome-btn xs"
                aria-label={`Add ${r.displayName} as an NPC`}
                title="Make a named NPC with its own copy of this stat block"
                onClick={() => onFromRecord(r.id)}
              >
                <Icon name="plus" />
              </button>
            </li>
          ))}
          {found.more && (
            <MoreRow shown={creatures.length} total={found.total} onMore={found.showMore} />
          )}
        </ul>
      )}
    </div>
  );
}
