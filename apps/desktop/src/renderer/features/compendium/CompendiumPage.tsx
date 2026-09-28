import { useEffect, useRef } from 'react';
import { CR_ORDER, crToNumber } from '@trifold/rules';
import type { RecordKind } from '@trifold/schema';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { useSourcesStore } from '../../stores/sourcesStore';
import { MonsterEditor } from './MonsterEditor';
import { RecordDetail } from './RecordDetail';

const KINDS: Array<{ id: RecordKind; label: string }> = [
  { id: 'monster', label: 'Monsters' },
  { id: 'spell', label: 'Spells' },
  { id: 'item', label: 'Items' },
  { id: 'feat', label: 'Feats' },
  { id: 'species', label: 'Species' },
  { id: 'background', label: 'Backgrounds' },
  { id: 'class', label: 'Classes' },
];

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
  const openByKey = useCompendiumStore((s) => s.openByKey);
  const switchEdition = useCompendiumStore((s) => s.switchEdition);
  const back = useCompendiumStore((s) => s.back);
  const clearError = useCompendiumStore((s) => s.clearError);
  const editing = useCompendiumStore((s) => s.editing);
  const saving = useCompendiumStore((s) => s.saving);
  const duplicateSelected = useCompendiumStore((s) => s.duplicateSelected);
  const startEdit = useCompendiumStore((s) => s.startEdit);
  const cancelEdit = useCompendiumStore((s) => s.cancelEdit);
  const saveHomebrew = useCompendiumStore((s) => s.saveHomebrew);
  const removeHomebrew = useCompendiumStore((s) => s.removeHomebrew);
  const sources = useSourcesStore((s) => s.sources);
  const loadSources = useSourcesStore((s) => s.load);

  const debounce = useRef<number | null>(null);

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
  }, [filters, search]);

  const update = (patch: Parameters<typeof setFilters>[0]) => setFilters(patch);
  const sourceId = filters.sourceIds?.[0] ?? '';

  return (
    <section className="compendium">
      <h1>Compendium</h1>
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}

      <div className="row tabs" role="tablist" aria-label="Record kind">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="tab"
            className="btn"
            aria-selected={k.id === kind}
            aria-pressed={k.id === kind}
            onClick={() => void setKind(k.id)}
          >
            {k.label}
          </button>
        ))}
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
              aria-label="NPC filter"
              value={filters.npc ?? 'any'}
              onChange={(e) => update({ npc: e.target.value as 'any' | 'only' | 'exclude' })}
            >
              <option value="any">NPCs and monsters</option>
              <option value="exclude">Hide named NPCs</option>
              <option value="only">Named NPCs only</option>
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

      <div className="split">
        <div className="list" role="listbox" aria-label="Results">
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
              className="list-row"
              onClick={() => void select(r.id)}
            >
              <span className="list-name">{r.displayName}</span>
              <span className="list-meta">
                {kind === 'monster' && (
                  <>
                    {r.cr !== null && <span>CR {r.cr}</span>}
                    {r.type && <span>{r.type}</span>}
                    {r.size && <span>{SIZE_LABEL[r.size] ?? r.size}</span>}
                    {r.isNpc && <span className="badge">NPC</span>}
                  </>
                )}
                {kind === 'spell' && r.level !== null && (
                  <span>{r.level === 0 ? 'Cantrip' : `Level ${r.level}`}</span>
                )}
                {kind === 'item' && (
                  <>
                    {r.typeCode && <span>{r.typeCode}</span>}
                    {r.rarity && <span>{r.rarity}</span>}
                  </>
                )}
                <span className="badge">{r.edition === '2014' ? 'legacy' : r.edition}</span>
                <span className="badge source">{r.sourceName}</span>
              </span>
            </button>
          ))}
          {!loading && rows.length === 0 && (
            <p className="muted">
              {sources.length === 0
                ? 'No sources yet. Import a compendium XML file in Settings → Sources.'
                : 'Nothing matches these filters.'}
            </p>
          )}
        </div>
        <div className="inspector">
          {editing && editing.kind === 'monster' ? (
            <MonsterEditor
              key={editing.id}
              record={editing}
              saving={saving}
              onCancel={cancelEdit}
              onSave={(r) => void saveHomebrew(r)}
            />
          ) : selected ? (
            <RecordDetail
              record={selected}
              editions={editions}
              canGoBack={history.length > 0}
              onBack={back}
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
