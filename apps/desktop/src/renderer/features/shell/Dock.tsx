import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { MinorKind } from '@trifold/schema';
import { useMusicStore } from '../../stores/musicStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { useRollLogStore } from '../../stores/rollLogStore';
import { MINOR_TITLES } from '../../stores/shellLayout';
import { useShellStore } from '../../stores/shellStore';
import { Icon } from './icons';
import { MINOR_ICON, MinorBody } from './minors';

/**
 * The dock (ADR 0004 §3.4): minors as toggled sections on the right. Wide 400, narrow 300,
 * icons 44 (a tap opens a flyout), or hidden. The last open section takes the remaining height
 * and scrolls inside; headers never scroll away.
 */
export function Dock() {
  const dock = useShellStore((s) => s.layout.dock);
  const flyout = useShellStore((s) => s.flyout);
  const toggleSection = useShellStore((s) => s.toggleSection);
  const openTool = useShellStore((s) => s.openTool);
  const setDockMode = useShellStore((s) => s.setDockMode);
  const setDockWidth = useShellStore((s) => s.setDockWidth);
  const [collapsed, setCollapsed] = useState<Set<MinorKind>>(new Set());
  const pips = useLivePips();
  const effective = useShellStore((s) => s.effectiveDock)();
  const expandDock = useShellStore((s) => s.expandDock);
  const trimmed = effective === 'icons' && dock.state === 'narrow';

  if (dock.state === 'hidden') return null;

  if (effective === 'icons') {
    return (
      <aside className="dock icons" aria-label="Dock" data-testid="dock">
        <button
          type="button"
          className="chrome-btn"
          aria-label="Expand dock"
          title="Expand dock"
          onClick={() => (trimmed ? expandDock() : setDockMode('narrow'))}
        >
          <Icon name="expand" size={15} />
        </button>
        {dock.sections.map((s) => (
          <button
            key={s.tool}
            type="button"
            className={`chrome-btn dock-ib${flyout === s.tool ? ' on' : ''}`}
            aria-label={`${MINOR_TITLES[s.tool]} tool`}
            aria-pressed={flyout === s.tool}
            title={MINOR_TITLES[s.tool]}
            data-tool={s.tool}
            onClick={() => openTool(s.tool)}
          >
            <Icon name={MINOR_ICON[s.tool]} size={16} />
            {pips.has(s.tool) && <span className="pip" />}
          </button>
        ))}
      </aside>
    );
  }

  const dragEdge = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const target = e.currentTarget;
    const right = target.parentElement?.getBoundingClientRect().right ?? window.innerWidth;
    target.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    const move = (ev: PointerEvent) => setDockWidth(right - ev.clientX);
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  const open = dock.sections.filter((s) => s.open);
  const toggleCollapsed = (tool: MinorKind) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      return next;
    });

  return (
    <aside
      className={`dock ${dock.state}`}
      style={{ width: dock.width }}
      aria-label="Dock"
      data-testid="dock"
    >
      <div
        className="dock-edge"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize dock"
        onPointerDown={dragEdge}
      />
      <div className="dock-tabs" role="toolbar" aria-label="Dock tools">
        {dock.sections.map((s) => (
          <button
            key={s.tool}
            type="button"
            className={`chrome-btn dock-ib${s.open ? ' on' : ''}`}
            aria-label={`${MINOR_TITLES[s.tool]} tool`}
            aria-pressed={s.open}
            title={MINOR_TITLES[s.tool]}
            data-tool={s.tool}
            onClick={() => toggleSection(s.tool)}
          >
            <Icon name={MINOR_ICON[s.tool]} size={16} />
            {pips.has(s.tool) && <span className="pip" />}
          </button>
        ))}
        <span className="spacer" />
        <button
          type="button"
          className="chrome-btn"
          aria-label="Collapse dock to icons"
          title="Collapse to icons"
          onClick={() => setDockMode('icons')}
        >
          <Icon name="collapse" size={15} />
        </button>
      </div>
      <div className="dock-sections">
        {open.length === 0 && <p className="muted dock-empty">No tools open. Toggle one above.</p>}
        {open.map((s, i) => {
          const isCollapsed = collapsed.has(s.tool);
          return (
            <section
              key={s.tool}
              className={`dsec${i === open.length - 1 ? ' last' : ''}${isCollapsed ? ' collapsed' : ''}`}
              aria-label={MINOR_TITLES[s.tool]}
              data-section={s.tool}
            >
              <header className="dh">
                <Icon name={MINOR_ICON[s.tool]} size={14} />
                <span className="dh-name">{MINOR_TITLES[s.tool]}</span>
                {pips.has(s.tool) && <span className="pip" />}
                <SectionSummary tool={s.tool} collapsed={isCollapsed} />
                <span className="spacer" />
                <button
                  type="button"
                  className="chrome-btn xs"
                  aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${MINOR_TITLES[s.tool]}`}
                  onClick={() => toggleCollapsed(s.tool)}
                >
                  <Icon name={isCollapsed ? 'down' : 'up'} size={13} />
                </button>
              </header>
              {!isCollapsed && (
                <div className="dsec-body">
                  <MinorBody kind={s.tool} />
                </div>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

/** Which tools carry a live pip: TV and Scenes while a scene is on, Music while playing. */
export function useLivePips(): Set<MinorKind> {
  const sceneLive = usePresenterStore((s) => !!s.state.scene && !s.state.blackout);
  const playing = useMusicStore((s) => s.playing);
  const pips = new Set<MinorKind>();
  if (sceneLive) {
    pips.add('tv');
    pips.add('scenes');
  }
  if (playing) pips.add('music');
  return pips;
}

function SectionSummary({ tool, collapsed }: { tool: MinorKind; collapsed: boolean }) {
  const scene = usePresenterStore((s) => (s.state.blackout ? 'Blackout' : s.state.scene?.title));
  const trackId = useMusicStore((s) => s.order[s.index] ?? null);
  const track = useMusicStore((s) => s.library?.tracks.find((t) => t.id === trackId)?.title);
  const playing = useMusicStore((s) => s.playing);
  const togglePlay = useMusicStore((s) => s.togglePlay);
  const last = useRollLogStore((s) => s.entries[0]?.total);
  if (tool === 'music' && track) {
    return (
      <>
        <span className="dh-sum">{track}</span>
        {collapsed && (
          <button
            type="button"
            className="chrome-btn xs"
            aria-label={playing ? 'Pause music' : 'Play music'}
            onClick={() => void togglePlay()}
          >
            <Icon name={playing ? 'pause' : 'play'} size={12} />
          </button>
        )}
      </>
    );
  }
  if (tool === 'tv' && scene) return <span className="dh-sum">{scene}</span>;
  if (tool === 'dice' && last !== undefined) return <span className="dh-sum mono">{last}</span>;
  return null;
}
