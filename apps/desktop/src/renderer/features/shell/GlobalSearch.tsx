import { forwardRef, useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { hk } from '../../platform';
import {
  flattenGroups,
  openResult,
  SEARCH_COMPACT_BELOW,
  useSearchStore,
  viewGroups,
  type SearchGroupView,
  type SearchResult,
} from '../../stores/searchStore';
import { useShellStore } from '../../stores/shellStore';
import { Icon } from './icons';

/**
 * Global search (ADR 0017): `GlobalSearch` is the field in the middle of the top bar, or a
 * search button when the window is narrow; `SearchResults` fills the `search` pop-up under it
 * with the grouped results (and, when narrow, the field itself). Arrows move, Enter opens the
 * active result through `navigate`, Escape clears. In the Library the same field searches every
 * campaign, and a row opens its campaign before it lands (`openResult`). Every row is a `navigate` target and nothing
 * else, so what search can reach is exactly what deep links can reach.
 */
const RESULTS_ID = 'global-search-results';

const optionId = (key: string) => `gs-${key.replace(/[^a-z0-9]/gi, '-')}`;

/** The grouped results and the highlighted row, re-derived only when the store's lists change. */
function useResults(): { groups: SearchGroupView[]; active: SearchResult | null } {
  const local = useSearchStore((s) => s.local);
  const compendium = useSearchStore((s) => s.compendium);
  const compendiumText = useSearchStore((s) => s.compendiumText);
  const expanded = useSearchStore((s) => s.expanded);
  const capped = useSearchStore((s) => s.capped);
  const activeKey = useSearchStore((s) => s.activeKey);
  return useMemo(() => {
    const groups = viewGroups({ local, compendium, compendiumText, expanded, capped });
    const flat = flattenGroups(groups);
    return { groups, active: flat.find((r) => r.key === activeKey) ?? flat[0] ?? null };
  }, [local, compendium, compendiumText, expanded, capped, activeKey]);
}

export const SearchField = forwardRef<HTMLInputElement, { autoFocus?: boolean }>(
  function SearchField({ autoFocus }, ref) {
    const query = useSearchStore((s) => s.query);
    const setQuery = useSearchStore((s) => s.setQuery);
    const clear = useSearchStore((s) => s.clear);
    const open = useShellStore((s) => s.pop === 'search');
    const openPop = useShellStore((s) => s.openPop);
    const closePop = useShellStore((s) => s.closePop);
    const library = useShellStore((s) => s.space === 'library');
    const { active } = useResults();

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      const store = useSearchStore.getState();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!open && store.query.trim()) openPop('search');
        store.move(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (store.activate()) e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // Out of Show all first; the next Escape clears.
        if (store.expanded) {
          store.setExpanded(null);
          return;
        }
        clear();
        closePop();
        e.currentTarget.blur();
      }
    };

    return (
      <>
        <Icon name="search" size={14} />
        <input
          ref={ref}
          type="search"
          role="combobox"
          aria-label={library ? 'Search every campaign' : 'Search the campaign and compendium'}
          aria-expanded={open}
          aria-controls={RESULTS_ID}
          aria-autocomplete="list"
          aria-activedescendant={open && active ? optionId(active.key) : undefined}
          placeholder={`${library ? 'Search every campaign' : 'Search'} ${hk('Ctrl+F')}`}
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim()) openPop('search');
            else closePop();
          }}
          onFocus={() => {
            if (query.trim()) openPop('search');
          }}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button
            type="button"
            className="chrome-btn xs"
            aria-label="Clear search"
            title="Clear"
            onClick={() => {
              clear();
              closePop();
            }}
          >
            <Icon name="close" />
          </button>
        )}
      </>
    );
  },
);

/** The field in the top bar, or the button that opens it in a narrow window. */
export function GlobalSearch() {
  const compact = useShellStore((s) => s.viewportWidth < SEARCH_COMPACT_BELOW);
  const open = useShellStore((s) => s.pop === 'search');
  const openPop = useShellStore((s) => s.openPop);
  const togglePop = useShellStore((s) => s.togglePop);
  const summoned = useSearchStore((s) => s.summoned);
  const library = useShellStore((s) => s.space === 'library');
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+F: focus the field, or open the pop-up that holds it.
  useEffect(() => {
    if (!summoned) return;
    if (compact || !inputRef.current) {
      openPop('search');
      return;
    }
    inputRef.current.focus();
    inputRef.current.select();
    if (useSearchStore.getState().query.trim()) openPop('search');
    // Runs once per summons; `compact` at that moment decides where the field is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summoned]);

  if (compact) {
    return (
      <button
        type="button"
        className={`chrome-btn${open ? ' on' : ''}`}
        aria-label="Search"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-pop="search"
        title={`${library ? 'Search every campaign' : 'Search the campaign and compendium'} (${hk('Ctrl+F')})`}
        onClick={() => togglePop('search')}
      >
        <Icon name="search" />
      </button>
    );
  }
  return (
    <div className="topbar-search" data-pop="search" data-testid="global-search">
      <SearchField ref={inputRef} />
    </div>
  );
}

/** The pop-up body: grouped results, with the field above them in a narrow window. */
export function SearchResults({ withField }: { withField: boolean }) {
  const query = useSearchStore((s) => s.query);
  const loading = useSearchStore((s) => s.loading);
  const error = useSearchStore((s) => s.error);
  const setActive = useSearchStore((s) => s.setActive);
  const expanded = useSearchStore((s) => s.expanded);
  const setExpanded = useSearchStore((s) => s.setExpanded);
  const closePop = useShellStore((s) => s.closePop);
  const library = useShellStore((s) => s.space === 'library');
  const { groups, active } = useResults();
  /** Buttons in the list keep the cursor in the field, so the arrows still move. */
  const keepFocus = (e: { preventDefault(): void }) => e.preventDefault();
  const trimmed = query.trim();

  useEffect(() => {
    if (active) document.getElementById(optionId(active.key))?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <>
      {withField && (
        <div className="row search-pop-field">
          <div className="topbar-search" data-pop="search">
            <SearchField autoFocus />
          </div>
          <button
            type="button"
            className="chrome-btn xs"
            aria-label="Close search"
            title="Close"
            onClick={closePop}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      <div
        id={RESULTS_ID}
        className="search-results"
        role="listbox"
        aria-label="Search results"
        data-testid="search-results"
      >
        {expanded && (
          <div className="row search-expanded-head">
            <button
              type="button"
              className="chrome-btn xs"
              aria-label="Back to all results"
              title="Back to all results (Esc)"
              onMouseDown={keepFocus}
              onClick={() => setExpanded(null)}
            >
              <Icon name="left" />
            </button>
            <span className="muted small">All results · showing one type</span>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.group} role="group" aria-label={g.label} className="search-group">
            <div className="search-group-head">
              {g.label}
              <span className="muted">
                {g.results.length + g.more}
                {g.capped ? '+' : ''}
              </span>
              {!expanded && (g.more > 0 || g.capped) && (
                <button
                  type="button"
                  className="link small search-show-all"
                  aria-label={`Show all ${g.label}`}
                  onMouseDown={keepFocus}
                  onClick={() => setExpanded(g.group)}
                >
                  Show all
                </button>
              )}
            </div>
            {g.results.map((r) => (
              <div
                key={r.key}
                id={optionId(r.key)}
                role="option"
                aria-selected={active?.key === r.key}
                className={`search-result${active?.key === r.key ? ' active' : ''}${r.snippet ? ' has-snippet' : ''}`}
                data-testid="search-result"
                onMouseEnter={() => setActive(r.key)}
                onClick={() => openResult(r)}
              >
                <Icon name={r.icon} size={14} />
                <span className="search-title">{r.title}</span>
                {r.detail && <span className="search-detail muted small">{r.detail}</span>}
                {r.snippet && (
                  <span className="search-snippet small">
                    {r.snippet.before}
                    <mark>{r.snippet.match}</mark>
                    {r.snippet.after}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
        {trimmed && loading && !groups.some((g) => g.group === 'compendium') && (
          <p className="muted small search-status">
            {library ? 'Reading your campaigns…' : 'Searching the compendium…'}
          </p>
        )}
        {error && (
          <p className="muted small search-status" role="alert">
            {library ? 'Could not read the campaigns' : 'Compendium search failed'}: {error}
          </p>
        )}
        {trimmed && !loading && groups.length === 0 && !error && (
          <p className="muted search-status">Nothing matches “{trimmed}”.</p>
        )}
        {!trimmed && (
          <p className="muted search-status">
            {library
              ? 'Type a name or a phrase: notes, NPCs, the party, encounters and scenes in every campaign, and the text inside your notes.'
              : 'Type a name or a phrase: notes, NPCs, encounters, scenes, creatures, spells, and the text inside your notes.'}
          </p>
        )}
      </div>
      <div className="search-foot small">
        <span>
          <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> move
        </span>
        <span>
          <kbd className="kbd">Enter</kbd> open
        </span>
        <span>
          <kbd className="kbd">Esc</kbd> clear
        </span>
      </div>
    </>
  );
}
