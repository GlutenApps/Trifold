import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  isWebTabKey,
  MAJOR_KINDS,
  normalizeWebUrl,
  webTabId,
  webTabKey,
  type StageGroup,
  type TabKey,
  type WebTab,
  type WebTabIcon,
} from '@trifold/schema';
import { fitSplit, tabTitle } from '../../stores/shellLayout';
import { useFit, useShellStore } from '../../stores/shellStore';
import { useAppStore } from '../../stores/appStore';
import { useCombatStore } from '../../stores/combatStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { useSceneStore } from '../../stores/sceneStore';
import { Icon, type IconName } from './icons';
import { MAJOR_ICON, MajorBody } from './majors';
import { WebTabIconPicker, WebTabPage } from './WebTabPage';
import { hk } from '../../platform';

/**
 * The stage (ADR 0004): one or two tab groups of majors and web tabs, each with its own tab
 * strip, plus the divider, the + menu, split and maximize, and tab drag and drop between and
 * within groups. The layout itself is decided in shellLayout.ts; this file draws it and turns
 * pointer and keyboard gestures into shell store actions. `Stage` below has the detail.
 */

/** The web tab behind a stage key, or null when the Library no longer has it. */
function webTabOf(kind: TabKey, webTabs: readonly WebTab[]): WebTab | null {
  if (!isWebTabKey(kind)) return null;
  const id = webTabId(kind);
  return webTabs.find((t) => t.id === id) ?? null;
}

function tabIcon(kind: TabKey, webTabs: readonly WebTab[]): IconName {
  return isWebTabKey(kind) ? (webTabOf(kind, webTabs)?.icon ?? 'globe') : MAJOR_ICON[kind];
}

const DRAG_THRESHOLD = 6;
/** Room a tab needs with its label, and as an icon only. */
const TAB_FULL = 104;
const TAB_ICON = 34;
/** The strip's end buttons (+ ⤢) and padding. */
const STRIP_CHROME = 82;

type DropSpot = { group: number; index: number } | { split: true } | null;

/**
 * The stage (ADR 0004, stage): one or two tab groups. Every major stays mounted, active or not,
 * so nothing loses its place; closed majors live in a hidden holder. When two groups do not
 * fit side by side (ADR 0014) they fold into one stack: both stay mounted, the focused one is
 * shown under a strip of every tab, and widening the window brings the saved split back.
 */
export function Stage() {
  const layout = useShellStore((s) => s.layout);
  const focusedGroup = useShellStore((s) => s.focusedGroup);
  const focusGroup = useShellStore((s) => s.focusGroup);
  const setSplit = useShellStore((s) => s.setSplit);
  const moveTab = useShellStore((s) => s.moveTab);
  const draggingTab = useShellStore((s) => s.draggingTab);
  const setDraggingTab = useShellStore((s) => s.setDraggingTab);
  const webTabs = useShellStore((s) => s.webTabs);
  const stageRef = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState<DropSpot>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const fit = useFit();
  const { groups, maximized } = layout.stage;
  const split = fitSplit(layout.stage.split, fit);
  const folded = fit.folded;
  /** Folded: the group on show is the focused one; its tab strip lists every open tab. */
  const shownGroup = Math.min(focusedGroup, groups.length - 1);
  const allTabs = groups.flatMap((g) => g.tabs);
  const open = new Set(groups.flatMap((g) => g.tabs));
  const parked = MAJOR_KINDS.filter((k) => !open.has(k));

  const dragDivider = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    const move = (ev: PointerEvent) => setSplit((ev.clientX - rect.left) / Math.max(1, rect.width));
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  /** Where a dragged tab would land: a strip position, or the split zone of a lone group. */
  const spotAt = (x: number, y: number): DropSpot => {
    const strips = stageRef.current?.querySelectorAll<HTMLElement>('[data-strip]') ?? [];
    for (const strip of strips) {
      const r = strip.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top - 8 || y > r.bottom + 8) continue;
      const group = Number(strip.dataset['strip']);
      const tabs = [...strip.querySelectorAll<HTMLElement>('[data-tab]')];
      let index = tabs.length;
      for (let i = 0; i < tabs.length; i++) {
        const t = tabs[i]!.getBoundingClientRect();
        if (x < t.left + t.width / 2) {
          index = i;
          break;
        }
      }
      return { group, index };
    }
    const rect = stageRef.current?.getBoundingClientRect();
    if (
      rect &&
      groups.length === 1 &&
      maximized === null &&
      fit.canSplit &&
      x > rect.left + rect.width / 2
    ) {
      return { split: true };
    }
    return null;
  };

  const beginTabDrag = (kind: TabKey) => (e: ReactPointerEvent<HTMLElement>) => {
    // Folded, the strip mixes both groups, so dragging could not say where a tab belongs.
    if (e.button !== 0 || folded) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;
    let spot: DropSpot = null;
    const finish = (commit: boolean) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      document.body.classList.remove('dragging-panel');
      setGhost(null);
      setDrop(null);
      if (!active) return;
      setDraggingTab(null);
      if (!commit || !spot) return;
      if ('split' in spot) moveTab(kind, 1);
      else moveTab(kind, spot.group as 0 | 1, spot.index);
    };
    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
        active = true;
        setDraggingTab(kind);
        document.body.classList.add('dragging-panel');
      }
      spot = spotAt(ev.clientX, ev.clientY);
      setGhost({ x: ev.clientX, y: ev.clientY });
      setDrop(spot);
    };
    const up = (ev: PointerEvent) => {
      if (active) spot = spotAt(ev.clientX, ev.clientY);
      finish(true);
    };
    const cancel = () => finish(false);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
  };

  return (
    <div className="stage" ref={stageRef}>
      {groups.map((g, i) => {
        if (maximized !== null && maximized !== i) return null;
        const away = folded && i !== shownGroup;
        // A lone group takes the whole stage: a grow below 1 would leave the rest empty.
        const grow =
          maximized !== null || groups.length === 1 || folded ? 1 : i === 0 ? split : 1 - split;
        return (
          <Fragment key={i}>
            {i === 1 && maximized === null && !folded && (
              <div
                className="stage-div"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize groups"
                onPointerDown={dragDivider}
              />
            )}
            <section
              className={`grp${focusedGroup === i && !folded ? ' focused' : ''}${away ? ' folded-away' : ''}`}
              aria-hidden={away || undefined}
              style={{ flexGrow: grow }}
              data-group={i}
              aria-label={`Stage group ${i + 1}`}
              onPointerDownCapture={() => focusGroup(i as 0 | 1)}
            >
              <TabStrip
                group={i}
                data={folded ? { tabs: allTabs, active: g.active } : g}
                stacked={folded}
                dropIndex={drop && 'group' in drop && drop.group === i ? drop.index : null}
                onTabPointerDown={beginTabDrag}
              />
              <div className="grp-content">
                {g.tabs.map((kind) => {
                  const web = webTabOf(kind, webTabs);
                  if (isWebTabKey(kind)) {
                    // A web tab stays mounted while hidden (visibility, not display) so the
                    // page keeps its place; it unloads only when closed (ADR 0011).
                    return web ? (
                      <div
                        key={kind}
                        className="grp-body web"
                        hidden={g.active !== kind}
                        data-web={web.id}
                        role="tabpanel"
                        aria-label={web.title}
                      >
                        <WebTabPage tab={web} />
                      </div>
                    ) : null;
                  }
                  return (
                    <div
                      key={kind}
                      className="grp-body"
                      hidden={g.active !== kind}
                      data-major={kind}
                      role="tabpanel"
                      aria-label={tabTitle(kind, webTabs)}
                    >
                      <MajorBody kind={kind} />
                    </div>
                  );
                })}
              </div>
            </section>
          </Fragment>
        );
      })}
      {drop && 'split' in drop && <div className="split-zone">Split right</div>}
      {ghost && draggingTab && (
        <div className="drag-ghost" style={{ left: ghost.x + 14, top: ghost.y + 14 }}>
          {tabTitle(draggingTab, webTabs)}
        </div>
      )}
      <div className="stage-parked" hidden aria-hidden="true">
        {parked.map((kind) => (
          <div key={kind} data-major={kind}>
            <MajorBody kind={kind} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TabStrip({
  group,
  data,
  dropIndex,
  stacked = false,
  onTabPointerDown,
}: {
  group: number;
  data: StageGroup;
  /** Two groups shown as one stack: every tab, no maximize (ADR 0014). */
  stacked?: boolean;
  dropIndex: number | null;
  onTabPointerDown: (kind: TabKey) => (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  const layout = useShellStore((s) => s.layout);
  const webTabs = useShellStore((s) => s.webTabs);
  const openMajor = useShellStore((s) => s.openMajor);
  const closeTab = useShellStore((s) => s.closeTab);
  const moveTab = useShellStore((s) => s.moveTab);
  const addWebTab = useShellStore((s) => s.addWebTab);
  const toggleMaximize = useShellStore((s) => s.toggleMaximize);
  const combatLive = useCombatStore((s) => !!s.state);
  const liveSceneId = usePresenterStore((s) => (s.state.blackout ? null : s.state.scene?.id));
  const selectedSceneId = useSceneStore((s) => s.selectedId);
  const playerOpen = useAppStore((s) => s.playerOpen);
  const unsavedHomebrew = false;
  const stripRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [menu, setMenu] = useState<'add' | 'addweb' | 'more' | null>(null);
  const [newTab, setNewTab] = useState<{ title: string; url: string; icon: WebTabIcon }>({
    title: '',
    url: '',
    icon: 'globe',
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const maximized = layout.stage.maximized === group;

  useEffect(() => {
    const el = stripRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu]);

  const isLive = (kind: TabKey) =>
    (kind === 'encounters' && combatLive) ||
    (kind === 'map' && !!liveSceneId && liveSceneId === selectedSceneId);
  const keepsLabel = (kind: TabKey) => kind === data.active || isLive(kind);

  // Too many tabs: labels drop from the others first, then the rest fold into ⋯. Long labels
  // can overflow before the estimate says so, so a measured overflow also counts (`tight`);
  // a resize or a tab change tries the labels again.
  const available = Math.max(0, width - STRIP_CHROME);
  const n = data.tabs.length;
  const [tight, setTight] = useState(false);
  useLayoutEffect(() => setTight(false), [width, n]);
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (el && !tight && el.scrollWidth > el.clientWidth + 1) setTight(true);
  }, [tight, width, n, data.active]);
  const iconify = width > 0 && (tight || n * TAB_FULL > available);
  const labelled = data.tabs.filter(keepsLabel).length;
  const capacity = Math.max(
    labelled,
    Math.floor((available - labelled * TAB_FULL) / TAB_ICON) + labelled,
  );
  const fold = iconify && n > capacity;
  const shown = fold
    ? data.tabs.filter((t, i) => keepsLabel(t) || i < capacity - labelled)
    : data.tabs;
  const folded = data.tabs.filter((t) => !shown.includes(t));
  // A major open in either group is not offered again; dragging its tab moves it.
  const isOpen = (k: TabKey) => layout.stage.groups.some((g) => g.tabs.includes(k));
  const addable: TabKey[] = [
    ...MAJOR_KINDS.filter((k) => !isOpen(k)),
    ...webTabs.map((t) => webTabKey(t.id)).filter((k) => !isOpen(k)),
  ];
  const submitNewTab = () => {
    const url = normalizeWebUrl(newTab.url);
    if (!url) return;
    setMenu(null);
    setNewTab({ title: '', url: '', icon: 'globe' });
    addWebTab({ url, title: newTab.title, icon: newTab.icon }, group as 0 | 1);
  };
  const onNewTabKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submitNewTab();
    if (e.key === 'Escape') setMenu(null);
  };

  return (
    <div
      className="tabs"
      ref={stripRef}
      data-strip={group}
      role="tablist"
      aria-label={`Stage group ${group + 1} tabs`}
    >
      {shown.map((kind, i) => {
        const active = data.active === kind;
        const iconOnly = iconify && !keepsLabel(kind);
        return (
          <Fragment key={kind}>
            {dropIndex === data.tabs.indexOf(kind) && <span className="tab-drop" />}
            <div
              className={`tab${active ? ' active' : ''}${iconOnly ? ' icon-only' : ''}${isLive(kind) ? ' live' : ''}`}
              role="tab"
              aria-selected={active}
              aria-label={tabTitle(kind, webTabs)}
              title={iconOnly ? tabTitle(kind, webTabs) : undefined}
              data-tab={kind}
              tabIndex={active ? 0 : -1}
              onPointerDown={onTabPointerDown(kind)}
              onClick={() => openMajor(kind)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') openMajor(kind);
                if (e.key === 'Delete') closeTab(kind);
              }}
            >
              {isLive(kind) && (
                <span className={`pip${kind === 'map' && playerOpen ? ' tally' : ''}`} />
              )}
              <Icon name={tabIcon(kind, webTabs)} size={14} />
              {!iconOnly && <span className="tab-label">{tabTitle(kind, webTabs)}</span>}
              {unsavedHomebrew && kind === 'compendium' && <span className="ring" />}
              <button
                type="button"
                className="tab-close"
                aria-label={`Close ${tabTitle(kind, webTabs)} tab`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(kind);
                }}
              >
                <Icon name="close" />
              </button>
            </div>
            {i === shown.length - 1 && dropIndex !== null && dropIndex >= data.tabs.length && (
              <span className="tab-drop" />
            )}
          </Fragment>
        );
      })}
      {folded.length > 0 && (
        <div className="tab-menu" ref={menu === 'more' ? menuRef : undefined}>
          <button
            type="button"
            className="chrome-btn"
            aria-label={`${folded.length} more tabs`}
            aria-haspopup="menu"
            onClick={() => setMenu(menu === 'more' ? null : 'more')}
          >
            <Icon name="menu" />
            <span className="count">{folded.length}</span>
          </button>
          {menu === 'more' && (
            <div className="menu" role="menu">
              {folded.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    openMajor(kind);
                  }}
                >
                  <Icon name={tabIcon(kind, webTabs)} size={14} /> {tabTitle(kind, webTabs)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <span className="spacer" />
      <div className="tabend">
        <div className="tab-menu" ref={menu === 'add' || menu === 'addweb' ? menuRef : undefined}>
          <button
            type="button"
            className="chrome-btn"
            aria-label={`Add a tab to group ${group + 1}`}
            title="Open a tab here"
            aria-haspopup="menu"
            aria-expanded={menu === 'add' || menu === 'addweb'}
            onClick={() => setMenu(menu === 'add' || menu === 'addweb' ? null : 'add')}
          >
            <Icon name="plus" />
          </button>
          {menu === 'add' && (
            <div className="menu" role="menu" aria-label="Tabs">
              {addable.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    moveTab(kind, group as 0 | 1);
                  }}
                >
                  <Icon name={tabIcon(kind, webTabs)} size={14} />
                  <span className="grow">{tabTitle(kind, webTabs)}</span>
                </button>
              ))}
              {addable.length > 0 && <div className="menu-sep" />}
              <button type="button" role="menuitem" onClick={() => setMenu('addweb')}>
                <Icon name="globe" size={14} />
                <span className="grow">New web tab…</span>
              </button>
            </div>
          )}
          {menu === 'addweb' && (
            <div className="menu web-new" role="group" aria-label="New web tab">
              <input
                type="text"
                aria-label="Tab name"
                placeholder="Name (follows the page title when empty)"
                autoFocus
                value={newTab.title}
                onChange={(e) => setNewTab({ ...newTab, title: e.target.value })}
                onKeyDown={onNewTabKey}
              />
              <input
                type="text"
                aria-label="Web address"
                placeholder="https://…"
                spellCheck={false}
                value={newTab.url}
                onChange={(e) => setNewTab({ ...newTab, url: e.target.value })}
                onKeyDown={onNewTabKey}
              />
              <div className="row">
                <WebTabIconPicker
                  value={newTab.icon}
                  onChange={(icon) => setNewTab({ ...newTab, icon })}
                />
                <button
                  type="button"
                  className="chrome-btn primary"
                  aria-label="Add web tab"
                  title="Add web tab"
                  disabled={!normalizeWebUrl(newTab.url)}
                  onClick={submitNewTab}
                >
                  <Icon name="plus" />
                </button>
              </div>
            </div>
          )}
        </div>
        {!stacked && (
          <button
            type="button"
            className="chrome-btn"
            aria-label={maximized ? 'Restore groups' : 'Maximize group'}
            aria-pressed={maximized}
            title={`${maximized ? 'Restore' : 'Maximize'} (${hk('Ctrl+Shift+M')})`}
            onClick={() => toggleMaximize(group)}
          >
            <Icon name={maximized ? 'restore' : 'maximize'} />
          </button>
        )}
      </div>
    </div>
  );
}
