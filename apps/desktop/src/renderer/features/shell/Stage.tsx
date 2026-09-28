import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { MAJOR_KINDS, type MajorKind, type StageGroup } from '@trifold/schema';
import { MAJOR_TITLES } from '../../stores/shellLayout';
import { useShellStore } from '../../stores/shellStore';
import { useCombatStore } from '../../stores/combatStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { useSceneStore } from '../../stores/sceneStore';
import { Icon } from './icons';
import { MAJOR_ICON, MajorBody } from './majors';

const DRAG_THRESHOLD = 6;
/** Room a tab needs with its label, and as an icon only. */
const TAB_FULL = 104;
const TAB_ICON = 34;
/** The strip's end buttons (+ ⧉ ⤢) and padding. */
const STRIP_CHROME = 112;

type DropSpot = { group: number; index: number } | { split: true } | null;

/**
 * The stage (ADR 0004 §3): one or two tab groups. Every major stays mounted, active or not,
 * so nothing loses its place; closed majors live in a hidden holder.
 */
export function Stage() {
  const layout = useShellStore((s) => s.layout);
  const focusedGroup = useShellStore((s) => s.focusedGroup);
  const focusGroup = useShellStore((s) => s.focusGroup);
  const setSplit = useShellStore((s) => s.setSplit);
  const moveTab = useShellStore((s) => s.moveTab);
  const draggingTab = useShellStore((s) => s.draggingTab);
  const setDraggingTab = useShellStore((s) => s.setDraggingTab);
  const stageRef = useRef<HTMLDivElement>(null);
  const [drop, setDrop] = useState<DropSpot>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const { groups, split, maximized } = layout.stage;
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
    if (rect && groups.length === 1 && maximized === null && x > rect.left + rect.width / 2) {
      return { split: true };
    }
    return null;
  };

  const beginTabDrag = (kind: MajorKind) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
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
        // A lone group takes the whole stage: a grow below 1 would leave the rest empty.
        const grow = maximized !== null || groups.length === 1 ? 1 : i === 0 ? split : 1 - split;
        return (
          <Fragment key={i}>
            {i === 1 && maximized === null && (
              <div
                className="stage-div"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize groups"
                onPointerDown={dragDivider}
              />
            )}
            <section
              className={`grp${focusedGroup === i ? ' focused' : ''}`}
              style={{ flexGrow: grow }}
              data-group={i}
              aria-label={`Stage group ${i + 1}`}
              onPointerDownCapture={() => focusGroup(i as 0 | 1)}
            >
              <TabStrip
                group={i}
                data={g}
                twoGroups={groups.length === 2}
                dropIndex={drop && 'group' in drop && drop.group === i ? drop.index : null}
                onTabPointerDown={beginTabDrag}
              />
              <div className="grp-content">
                {g.tabs.map((kind) => (
                  <div
                    key={kind}
                    className="grp-body"
                    hidden={g.active !== kind}
                    data-major={kind}
                    role="tabpanel"
                    aria-label={MAJOR_TITLES[kind]}
                  >
                    <MajorBody kind={kind} />
                  </div>
                ))}
              </div>
            </section>
          </Fragment>
        );
      })}
      {drop && 'split' in drop && <div className="split-zone">Split right</div>}
      {ghost && draggingTab && (
        <div className="drag-ghost" style={{ left: ghost.x + 14, top: ghost.y + 14 }}>
          {MAJOR_TITLES[draggingTab]}
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
  twoGroups,
  dropIndex,
  onTabPointerDown,
}: {
  group: number;
  data: StageGroup;
  twoGroups: boolean;
  dropIndex: number | null;
  onTabPointerDown: (kind: MajorKind) => (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  const layout = useShellStore((s) => s.layout);
  const openMajor = useShellStore((s) => s.openMajor);
  const closeTab = useShellStore((s) => s.closeTab);
  const moveTab = useShellStore((s) => s.moveTab);
  const splitRight = useShellStore((s) => s.splitRight);
  const toggleMaximize = useShellStore((s) => s.toggleMaximize);
  const combatLive = useCombatStore((s) => !!s.state);
  const liveSceneId = usePresenterStore((s) => (s.state.blackout ? null : s.state.scene?.id));
  const selectedSceneId = useSceneStore((s) => s.selectedId);
  const unsavedHomebrew = false;
  const stripRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [menu, setMenu] = useState<'add' | 'more' | null>(null);
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

  const isLive = (kind: MajorKind) =>
    (kind === 'encounters' && combatLive) ||
    (kind === 'map' && !!liveSceneId && liveSceneId === selectedSceneId);
  const keepsLabel = (kind: MajorKind) => kind === data.active || isLive(kind);

  // Too many tabs: labels drop from the others first, then the rest fold into ⋯.
  const available = Math.max(0, width - STRIP_CHROME);
  const n = data.tabs.length;
  const iconify = width > 0 && n * TAB_FULL > available;
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
  const addable = MAJOR_KINDS.filter((k) => !layout.stage.groups.some((g) => g.tabs.includes(k)));

  return (
    <div className="tabs" ref={stripRef} data-strip={group} role="tablist">
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
              aria-label={MAJOR_TITLES[kind]}
              title={iconOnly ? MAJOR_TITLES[kind] : undefined}
              data-tab={kind}
              tabIndex={active ? 0 : -1}
              onPointerDown={onTabPointerDown(kind)}
              onClick={() => openMajor(kind)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') openMajor(kind);
                if (e.key === 'Delete') closeTab(kind);
              }}
            >
              {isLive(kind) && <span className="pip" />}
              <Icon name={MAJOR_ICON[kind]} size={14} />
              {!iconOnly && <span className="tab-label">{MAJOR_TITLES[kind]}</span>}
              {unsavedHomebrew && kind === 'compendium' && <span className="ring" />}
              <button
                type="button"
                className="tab-close"
                aria-label={`Close ${MAJOR_TITLES[kind]} tab`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(kind);
                }}
              >
                <Icon name="close" size={11} />
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
            <Icon name="menu" size={14} />
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
                  <Icon name={MAJOR_ICON[kind]} size={14} /> {MAJOR_TITLES[kind]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <span className="spacer" />
      <div className="tabend">
        <div className="tab-menu" ref={menu === 'add' ? menuRef : undefined}>
          <button
            type="button"
            className="chrome-btn"
            aria-label={`Add a tab to group ${group + 1}`}
            title="Open a major here"
            aria-haspopup="menu"
            aria-expanded={menu === 'add'}
            disabled={addable.length === 0}
            onClick={() => setMenu(menu === 'add' ? null : 'add')}
          >
            <Icon name="plus" size={15} />
          </button>
          {menu === 'add' && (
            <div className="menu" role="menu" aria-label="Majors">
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
                  <Icon name={MAJOR_ICON[kind]} size={14} />
                  <span className="grow">{MAJOR_TITLES[kind]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="chrome-btn"
          aria-label="Split right"
          title={twoGroups && group === 1 ? 'Already the right group' : 'Split right'}
          disabled={!data.active || (twoGroups && group === 1) || maximized}
          onClick={() => data.active && splitRight(data.active)}
        >
          <Icon name="split" size={14} />
        </button>
        <button
          type="button"
          className="chrome-btn"
          aria-label={maximized ? 'Restore groups' : 'Maximize group'}
          aria-pressed={maximized}
          title={`${maximized ? 'Restore' : 'Maximize'} (Ctrl+Shift+M)`}
          onClick={() => toggleMaximize(group)}
        >
          <Icon name={maximized ? 'restore' : 'maximize'} size={14} />
        </button>
        {group === 1 && !twoGroups ? null : null}
      </div>
    </div>
  );
}
