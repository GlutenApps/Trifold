import { useEffect, useLayoutEffect, useRef, useState, type WheelEvent } from 'react';
import { CR_ORDER, crToNumber } from '@trifold/rules';
import type { RecordKind } from '@trifold/schema';
import { landOn, navKey, useNavTarget } from '../../navigate';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { useSourcesStore } from '../../stores/sourcesStore';
import { itemTypeName, shortSourceName } from './formatting';
import { HomebrewEditor } from './RecordEditor';
import { RecordDetail } from './RecordDetail';

/**
 * The Compendium browser (DESIGN.md §6.1): kind tabs, a filter bar that re-runs the search
 * shortly after every change, the results list, and the open record or homebrew editor beside
 * it. Duplicate editions collapse into one row with the open campaign's preferred edition in
 * front (DESIGN.md §7.2), and the detail pane keeps a history so spell links can go back. Below
 * 960 px the list and the record take turns (ADR 0014). The same component serves the console's
 * Compendium tab and Library › Compendium.
 */
const KINDS: Array<{ id: RecordKind; label: string }> = [
  { id: 'monster', label: 'Monsters' },
  { id: 'spell', label: 'Spells' },
  { id: 'item', label: 'Items' },
  { id: 'feat', label: 'Feats' },
  { id: 'species', label: 'Species' },
  { id: 'background', label: 'Backgrounds' },
  { id: 'class', label: 'Classes' },
  { id: 'condition', label: 'Conditions' },
];

function editionLabel(edition: string): string {
  return edition === '2014' ? 'legacy' : edition;
}

const SIZE_LABEL: Record<string, string> = {
  T: 'Tiny',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  H: 'Huge',
  G: 'Gargantuan',
};

export function CompendiumPage() {
  const kind = useCompendiumStore((s) => s.kind);
  const filters = useCompendiumStore((s) => s.filters);
  const rows = useCompendiumStore((s) => s.rows);
  const total = useCompendiumStore((s) => s.total);
  const tookMs = useCompendiumStore((s) => s.tookMs);
  const facets = useCompendiumStore((s) => s.facets);
  const loading = useCompendiumStore((s) => s.loading);
  const selected = useCompendiumStore((s) => s.selected);
  const editions = useCompendiumStore((s) => s.editions);
  const history = useCompendiumStore((s) => s.history);
  const error = useCompendiumStore((s) => s.error);
  const setKind = useCompendiumStore((s) => s.setKind);
  const setFilters = useCompendiumStore((s) => s.setFilters);
  const search = useCompendiumStore((s) => s.search);
  const loadFacets = useCompendiumStore((s) => s.loadFacets);
  const select = useCompendiumStore((s) => s.select);
  const openRecord = useCompendiumStore((s) => s.openRecord);
  const openByKey = useCompendiumStore((s) => s.openByKey);
  const switchEdition = useCompendiumStore((s) => s.switchEdition);
  const back = useCompendiumStore((s) => s.back);
  const clearError = useCompendiumStore((s) => s.clearError);
  const editing = useCompendiumStore((s) => s.editing);
  const editingNew = useCompendiumStore((s) => s.editingNew);
  const saving = useCompendiumStore((s) => s.saving);
  const duplicateSelected = useCompendiumStore((s) => s.duplicateSelected);
  const startEdit = useCompendiumStore((s) => s.startEdit);
  const cancelEdit = useCompendiumStore((s) => s.cancelEdit);
  const saveHomebrew = useCompendiumStore((s) => s.saveHomebrew);
  const removeHomebrew = useCompendiumStore((s) => s.removeHomebrew);
  const draftFrom = useCompendiumStore((s) => s.draftFrom);
  const draftApply = useCompendiumStore((s) => s.draftApply);
  const setDraftApply = useCompendiumStore((s) => s.setDraftApply);
  const sources = useSourcesStore((s) => s.sources);
  const loadSources = useSourcesStore((s) => s.load);
  // The open campaign's preferred edition heads each collapsed row; a change re-runs the search.
  const preferredEdition = useCampaignStore((s) => s.current?.campaign.preferredEdition);

  const debounce = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  const activeTab = useRef<HTMLButtonElement>(null);
  // Below 960 px the list and the record take turns (see `.split` in compendium.css): an open
  // record replaces the list until Back to results, a new search or a new kind brings it back.
  const [backedOut, setBackedOut] = useState(false);
  const showDetail = (editing !== null || selected !== null) && !backedOut;

  // Deep links (ADR 0017): a record opens here whatever kind the tab was showing.
  useNavTarget('record', (target) => {
    setBackedOut(false);
    void openRecord(target.id).then((ok) => ok && landOn(navKey('record', target.id)));
    return true;
  });

  useEffect(() => {
    void search();
    void loadFacets();
    void loadSources();
  }, [search, loadFacets, loadSources]);

  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void search(), 120);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [filters, preferredEdition, search]);

  // A record opened another way (a spell link, a new homebrew copy) shows itself.
  useEffect(() => setBackedOut(false), [selected?.id, editing]);

  // Back to results finds the list where it was: hiding it drops its scroll position.
  useLayoutEffect(() => {
    if (!showDetail && listRef.current) listRef.current.scrollTop = listScroll.current;
  }, [showDetail]);

  // The kind tabs scroll inside their strip in a narrow panel; keep the active one in view
  // when it is picked and when the panel narrows.
  useEffect(() => {
    const reveal = () => {
      const tab = activeTab.current;
      const strip = tab?.parentElement;
      if (!tab || !strip) return;
      if (tab.offsetLeft < strip.scrollLeft) strip.scrollLeft = tab.offsetLeft;
      const end = tab.offsetLeft + tab.offsetWidth - strip.clientWidth;
      if (end > strip.scrollLeft) strip.scrollLeft = end;
    };
    reveal();
    const strip = activeTab.current?.parentElement;
    if (!strip || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(reveal);
    watch.observe(strip);
    return () => watch.disconnect();
  }, [kind]);

  const update = (patch: Parameters<typeof setFilters>[0]) => {
    setBackedOut(true);
    setFilters(patch);
  };
  const open = (id: string) => {
    if (listRef.current) listScroll.current = listRef.current.scrollTop;
    setBackedOut(false);
    void select(id);
  };
  // A mouse wheel scrolls the tab strip sideways when it overflows.
  const wheelTabs = (e: WheelEvent<HTMLDivElement>) => {
    const strip = e.currentTarget;
    if (strip.scrollWidth > strip.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      strip.scrollLeft += e.deltaY;
    }
  };
  const sourceId = filters.sourceIds?.[0] ?? '';

  return (
    <section className="compendium">
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn small" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}

      <div className="subtabbar">
        <div className="subtablist" role="tablist" aria-label="Record kind" onWheel={wheelTabs}>
          {KINDS.map((k) => (
            <button
              key={k.id}
              ref={k.id === kind ? activeTab : undefined}
              type="button"
              role="tab"
              className={`subtab${k.id === kind ? ' active' : ''}`}
              aria-selected={k.id === kind}
              onClick={() => {
                setBackedOut(true);
                void setKind(k.id);
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="row filters">
        <input
          type="text"
          placeholder="Search names and text"
          aria-label="Search"
          value={filters.text ?? ''}
          onChange={(e) => update({ text: e.target.value })}
        />
        <select
          aria-label="Source"
          value={sourceId}
          onChange={(e) => update({ sourceIds: e.target.value ? [e.target.value] : undefined })}
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.enabled ? '' : ' (disabled)'}
            </option>
          ))}
        </select>
        <select
          aria-label="Edition"
          value={filters.edition ?? 'all'}
          onChange={(e) => update({ edition: e.target.value as 'all' | '2024' | '2014' })}
        >
          <option value="all">All editions</option>
          <option value="2024">2024</option>
          <option value="2014">Legacy</option>
        </select>
        {kind === 'monster' && (
          <>
            <select
              aria-label="Minimum CR"
              value={filters.crMin ?? ''}
              onChange={(e) =>
                update({ crMin: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            >
              <option value="">CR from</option>
              {CR_ORDER.map((cr) => (
                <option key={cr} value={crToNumber(cr) ?? 0}>
                  {cr}
                </option>
              ))}
            </select>
            <select
              aria-label="Maximum CR"
              value={filters.crMax ?? ''}
              onChange={(e) =>
                update({ crMax: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            >
              <option value="">CR to</option>
              {CR_ORDER.map((cr) => (
                <option key={cr} value={crToNumber(cr) ?? 0}>
                  {cr}
                </option>
              ))}
            </select>
            <select
              aria-label="Type"
              value={filters.type ?? ''}
              onChange={(e) => update({ type: e.target.value || undefined })}
            >
              <option value="">Any type</option>
              {facets.types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              aria-label="Size"
              value={filters.size ?? ''}
              onChange={(e) => update({ size: e.target.value || undefined })}
            >
              <option value="">Any size</option>
              {facets.sizes.map((s) => (
                <option key={s} value={s}>
                  {SIZE_LABEL[s] ?? s}
                </option>
              ))}
            </select>
            <select
              aria-label="Environment"
              value={filters.environment ?? ''}
              onChange={(e) => update({ environment: e.target.value || undefined })}
            >
              <option value="">Any environment</option>
              {facets.environments.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <select
              aria-label="Named filter"
              title="Stat blocks an imported book marks as a named character"
              value={filters.npc ?? 'any'}
              onChange={(e) => update({ npc: e.target.value as 'any' | 'only' | 'exclude' })}
            >
              <option value="any">Named and unnamed</option>
              <option value="exclude">Hide named characters</option>
              <option value="only">Named characters only</option>
            </select>
          </>
        )}
        {kind === 'spell' && (
          <select
            aria-label="Spell level"
            value={filters.level ?? ''}
            onChange={(e) =>
              update({ level: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          >
            <option value="">Any level</option>
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i} value={i}>
                {i === 0 ? 'Cantrip' : `Level ${i}`}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className={`split${showDetail ? ' show-detail' : ''}`}>
        <div className="list" role="listbox" aria-label="Results" ref={listRef}>
          <p className="muted list-status">
            {loading
              ? 'Searching…'
              : `${rows.length < total ? `${rows.length} of ` : ''}${total} result${total === 1 ? '' : 's'} · ${tookMs} ms`}
          </p>
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              role="option"
              aria-selected={selected?.id === r.id}
              className="list-row columns"
              data-kind={kind}
              onClick={() => open(r.id)}
            >
              {/* One grid cell per fact, always rendered (empty when unknown), so every column
                  keeps its place and a value lines up with the same value on the rows around it. */}
              <span className="list-name">{r.displayName}</span>
              {kind === 'monster' && (
                <>
                  <span className="cell cr">{r.cr !== null ? `CR ${r.cr}` : ''}</span>
                  <span className="cell type" title={r.type ?? undefined}>
                    {r.type ?? ''}
                  </span>
                  <span className="cell size">{r.size ? (SIZE_LABEL[r.size] ?? r.size) : ''}</span>
                  <span className="cell npc">
                    {r.isNpc && (
                      <span className="badge" title="A named character in its book">
                        Named
                      </span>
                    )}
                  </span>
                </>
              )}
              {kind === 'spell' && (
                <span className="cell level">
                  {r.level === null ? '' : r.level === 0 ? 'Cantrip' : `Level ${r.level}`}
                </span>
              )}
              {kind === 'item' && (
                <>
                  <span className="cell type" title={itemTypeName(r.typeCode) || undefined}>
                    {itemTypeName(r.typeCode)}
                  </span>
                  <span className="cell rarity">{r.rarity ?? ''}</span>
                </>
              )}
              {/* One pill: the source that answers by the DM's priority (ADR 0027), and a "+"
                  when the record is also somewhere else. */}
              <span className="cell list-source">
                <span
                  className="badge source-pill"
                  title={`${r.sourceName} · ${editionLabel(r.edition)} rules`}
                >
                  {shortSourceName(r.sourceName)}
                  {r.edition === '2014' ? ' · legacy' : ''}
                </span>
                {r.otherVersions.length > 0 && (
                  <span
                    className="badge more"
                    data-testid="more-versions"
                    aria-label={`Also in ${r.otherVersions.length} more`}
                    title={`Also in: ${r.otherVersions
                      .map((v) => `${v.sourceName} (${editionLabel(v.edition)})`)
                      .join(', ')}`}
                  >
                    +
                  </span>
                )}
              </span>
            </button>
          ))}
          {!loading && rows.length === 0 && (
            <p className="muted">
              {sources.length === 0
                ? 'No sources yet. Import a Game Master compendium XML file in the Library, under Compendium › Sources.'
                : 'Nothing matches these filters.'}
            </p>
          )}
        </div>
        <div
          className="inspector"
          data-nav={selected && !editing ? navKey('record', selected.id) : undefined}
        >
          {editing && draftFrom && (
            <div className="banner draft-origin" data-testid="draft-origin">
              <label className="row">
                <input
                  type="checkbox"
                  checked={draftApply}
                  onChange={(e) => setDraftApply(e.target.checked)}
                />
                {draftFrom.label}
              </label>
              <span className="muted small">{draftFrom.detail}</span>
            </div>
          )}
          {editing ? (
            <HomebrewEditor
              key={editing.id}
              record={editing}
              isNew={editingNew}
              saving={saving}
              onCancel={cancelEdit}
              onSave={(r) => void saveHomebrew(r)}
            />
          ) : selected ? (
            <RecordDetail
              record={selected}
              editions={editions}
              canGoBack={history.length > 0}
              backTo={history[history.length - 1]?.displayName}
              onBack={back}
              onBackToResults={() => setBackedOut(true)}
              onSwitchEdition={switchEdition}
              onOpenSpell={(key) => void openByKey('spell', key)}
              sourceNames={Object.fromEntries(sources.map((s) => [s.id, s.name]))}
              homebrew={{
                onDuplicate: () => void duplicateSelected(),
                onEdit: startEdit,
                onRemove: (id) => void removeHomebrew(id),
              }}
            />
          ) : (
            <p className="muted">Select a record to see its stat block.</p>
          )}
        </div>
      </div>
    </section>
  );
}
