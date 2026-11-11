import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { MinorKind } from '@trifold/schema';
import { useMusicStore } from '../../stores/musicStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { useTimersStore } from '../../stores/timersStore';
import { MINOR_TITLES } from '../../stores/shellLayout';
import { useFit, useShellStore } from '../../stores/shellStore';
import { Icon } from './icons';
import { MINOR_ICON, MinorBody } from './minors';

/**
 * The dock (ADR 0004, dock): minors as toggled sections on the right. Wide 400, narrow 360 or
 * icons 44 (a tap opens a flyout), chosen from its own header and the drag edge; it is never
 * hidden any more (ADR 0009), and a narrow window trims it to icons (ADR 0014). The last open
 * section takes the remaining height and scrolls inside; headers never scroll away.
 */
export function Dock() {
  const dock = useShellStore((s) => s.layout.dock);
  const flyout = useShellStore((s) => s.flyout);
  const toggleSection = useShellStore((s) => s.toggleSection);
  const openTool = useShellStore((s) => s.openTool);
  const setDockMode = useShellStore((s) => s.setDockMode);
  const setDockWidth = useShellStore((s) => s.setDockWidth);
  const openDock = useShellStore((s) => s.openDock);
  const [collapsed, setCollapsed] = useState<Set<MinorKind>>(new Set());
  const pips = useLivePips();
  const alerts = useAlertPips();
  const fit = useFit();
  const effective = fit.dock;
  const expandDock = useShellStore((s) => s.expandDock);
  const trimmed = fit.dockTrimmed;

  if (effective === 'icons') {
    return (
      <aside className="dock icons" aria-label="Dock" data-testid="dock">
        <button
          type="button"
          className="chrome-btn"
          aria-label="Expand dock"
          title={fit.canExpandDock ? 'Expand dock' : 'Widen the window to expand the dock'}
          disabled={!fit.canExpandDock}
          onClick={() => (trimmed ? expandDock() : openDock())}
        >
          <Icon name="expand" />
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
            <Icon name={MINOR_ICON[s.tool]} />
            {pips.has(s.tool) && <span className={`pip${alerts.has(s.tool) ? ' alert' : ''}`} />}
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
            <Icon name={MINOR_ICON[s.tool]} />
            {pips.has(s.tool) && <span className={`pip${alerts.has(s.tool) ? ' alert' : ''}`} />}
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
          <Icon name="collapse" />
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
                {pips.has(s.tool) && (
                  <span className={`pip${alerts.has(s.tool) ? ' alert' : ''}`} />
                )}
                <SectionSummary tool={s.tool} collapsed={isCollapsed} />
                <span className="spacer" />
                <button
                  type="button"
                  className="chrome-btn xs"
                  aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${MINOR_TITLES[s.tool]}`}
                  onClick={() => toggleCollapsed(s.tool)}
                >
                  <Icon name={isCollapsed ? 'down' : 'up'} />
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

/**
 * Which tools carry a live pip: Scenes while a scene is on, Music while playing, Timers while one
 * runs or has run out.
 */
function useLivePips(): Set<MinorKind> {
  const sceneLive = usePresenterStore((s) => !!s.state.scene && !s.state.blackout);
  const playing = useMusicStore((s) => s.playing);
  const timing = useTimersStore((s) =>
    Object.values(s.runs).some((r) => r.status === 'running' || r.status === 'done'),
  );
  const pips = new Set<MinorKind>();
  if (timing) pips.add('timers');
  if (sceneLive) pips.add('scenes');
  if (playing) pips.add('music');
  return pips;
}

function SectionSummary({ tool, collapsed }: { tool: MinorKind; collapsed: boolean }) {
  const trackId = useMusicStore((s) => s.order[s.index] ?? null);
  const track = useMusicStore((s) => s.library?.tracks.find((t) => t.id === trackId)?.title);
  const playing = useMusicStore((s) => s.playing);
  const togglePlay = useMusicStore((s) => s.togglePlay);
  if (tool === 'music' && track) {
    return (
      <>
        <span className="dh-sum">{track}</span>
        {collapsed && (
          <button
            type="button"
            className="chrome-btn xs"
            aria-label={playing ? 'Pause music' : 'Play music'}
            title={playing ? 'Pause music' : 'Play music'}
            onClick={() => void togglePlay()}
          >
            <Icon name={playing ? 'pause' : 'play'} />
          </button>
        )}
      </>
    );
  }
  return null;
}

/** Which tools' pips are alerts: Timers while a timer has run out and is not reset (ADR 0021). */
function useAlertPips(): Set<MinorKind> {
  const timeUp = useTimersStore((s) => Object.values(s.runs).some((r) => r.status === 'done'));
  return new Set<MinorKind>(timeUp ? ['timers'] : []);
}
