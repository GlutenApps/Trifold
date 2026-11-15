import { useEffect, useMemo, useState } from 'react';
import type { ClientView, CreatureView, TableIntent } from '@trifold/api';
import type { Connection } from './connection';
import { MapView, type DragHandlers } from './MapView';
import {
  CompanionsTool,
  ConditionsTool,
  creatureKey,
  HealthTool,
  hpBand,
  MoveTool,
  Summary,
  TargetChips,
  ToolTabs,
  TOOLS,
  type Tool,
} from './tools';
import { persistentTools, type Layout } from './useLayout';

/**
 * The page while a player holds characters (player UI handoff, 2026-11-15): the map as large as
 * the layout allows and four tools, one open at a time. Phone layouts open a tool on demand
 * (portrait as a bottom sheet over the map, landscape as a panel beside the rail) and a second tap
 * closes it; tablet and laptop layouts always show one, Health first.
 */
export function Playing({
  view,
  conn,
  layout,
  header,
}: {
  view: ClientView;
  conn: Connection;
  layout: Layout;
  /** The campaign name, connection and Switch, drawn as pills on the map in phone landscape. */
  header: React.ReactNode;
}) {
  // PCs first, each followed by its companions (Phase 3).
  const ordered = useMemo(() => {
    const out: CreatureView[] = [];
    for (const pc of view.mine.filter((c) => !c.companionOf)) {
      out.push(pc, ...view.mine.filter((c) => c.companionOf === pc.id));
    }
    for (const c of view.mine) if (!out.includes(c)) out.push(c);
    return out;
  }, [view.mine]);
  const me = ordered[0]!;
  const persistent = persistentTools(layout);
  const [tool, setTool] = useState<Tool | null>(persistent ? 'health' : null);
  const [target, setTarget] = useState(creatureKey(me));
  const [fullScreen, setFullScreen] = useState(false);
  useEffect(() => {
    if (persistent && !tool) setTool('health');
  }, [persistent, tool]);
  const current = ordered.find((c) => creatureKey(c) === target) ?? me;
  const companions = ordered.filter((c) => c !== me);

  const pick = (t: Tool) => setTool((open) => (open === t && !persistent ? null : t));
  const close = () => {
    if (!persistent) setTool(null);
  };
  const send = (c: CreatureView, intent: TableIntent) =>
    conn.send({ type: 'intent', creatureKind: c.kind, creatureId: c.id, intent });

  const movable = useMemo(
    () => new Set(view.mine.flatMap((c) => (c.tokenId && !c.movementLocked ? [c.tokenId] : []))),
    [view.mine],
  );
  const drag: DragHandlers = {
    movable,
    grab: (tokenId) => conn.send({ type: 'grab', tokenId }),
    preview: (tokenId, x, y) => conn.send({ type: 'preview', tokenId, x, y }),
    hold: (tokenId) => conn.send({ type: 'hold', tokenId }),
    drop: (tokenId, x, y, from) => conn.send({ type: 'drop', tokenId, x, y, from }),
    letGo: (tokenId) => conn.send({ type: 'letGo', tokenId }),
    ended: conn.dragEnded,
  };

  const conditionCount = me.conditions.length;
  const chips = (
    <TargetChips targets={ordered} selected={creatureKey(current)} onPick={setTarget} />
  );
  const toolBody =
    tool === 'health' ? (
      <>
        {chips}
        <HealthTool key={creatureKey(current)} creature={current} send={send} />
      </>
    ) : tool === 'conditions' ? (
      <>
        {chips}
        <ConditionsTool creature={current} send={send} />
      </>
    ) : tool === 'companions' ? (
      <CompanionsTool
        companions={companions}
        onRemove={(c) => conn.send({ type: 'releaseOne', creatureKind: c.kind, creatureId: c.id })}
      />
    ) : tool === 'move' ? (
      <>
        {chips}
        <MoveTool creature={current} />
      </>
    ) : null;
  const toolTitle = TOOLS.find((t) => t.id === tool)?.label ?? '';

  const initiative = ordered.filter((c) => c.needsInitiative);
  const phoneMove = tool === 'move' && layout === 'phonePortrait';
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  const overlay = (
    <>
      <div className="pc-overlay-top" onPointerDown={stop} onPointerUp={stop}>
        {layout === 'phoneLandscape' && <div className="pc-pills">{header}</div>}
        {me.movementLocked && me.tokenId && tool !== 'move' && (
          <div className="pc-movebanner locked" role="status">
            Movement locked by the DM
          </div>
        )}
        {initiative.map((c) => (
          <InitiativeCard
            key={creatureKey(c)}
            creature={c}
            onSubmit={(value) => send(c, { kind: 'initiative', value })}
          />
        ))}
        {phoneMove ? (
          <div className="pc-movecard">
            <MoveTool creature={current} />
            {chips}
          </div>
        ) : (
          tool === 'move' &&
          current.tokenId &&
          !current.movementLocked && (
            <div className="pc-movebanner" role="status">
              Moving {current.name}: drag the token or tap a spot.
            </div>
          )
        )}
      </div>
      {phoneMove && (
        <div className="pc-movecard-actions" onPointerDown={stop} onPointerUp={stop}>
          <button type="button" className="pc-btn" onClick={close}>
            Cancel
          </button>
          <button type="button" className="pc-btn primary" onClick={close}>
            Done
          </button>
        </div>
      )}
    </>
  );

  const map = view.map ? (
    <MapView
      map={view.map}
      selectedTokenId={current.tokenId ?? null}
      onSelectToken={(tokenId) => {
        const hit = ordered.find((c) => c.tokenId === tokenId);
        if (hit) setTarget(creatureKey(hit));
      }}
      drag={drag}
      tapMove={tool === 'move' ? (current.tokenId ?? null) : null}
      centerOn={me.tokenId ?? null}
      fullScreen={fullScreen}
      onFullScreen={() => setFullScreen((f) => !f)}
      overlay={overlay}
    />
  ) : (
    <div className="pc-map pc-center">
      {overlay}
      <p className="pc-hint">No map right now.</p>
    </div>
  );

  const { pct, band } = hpBand(me);
  return (
    <main
      className={`pc-play layout-${layout}${tool ? ' tool-open' : ''}${fullScreen ? ' full' : ''}`}
    >
      <div className="pc-mapwrap">{map}</div>

      {layout === 'phonePortrait' && (
        <>
          {tool !== 'move' && (
            <Summary creature={me} variant="strip" onClick={() => setTool('health')} />
          )}
          {tool && tool !== 'move' && (
            <>
              <button type="button" className="pc-scrim" aria-label="Close menu" onClick={close} />
              <section className="pc-sheet" role="dialog" aria-label={toolTitle}>
                <div className="pc-sheet-head">
                  <span className="pc-sheet-title">{toolTitle}</span>
                  <button
                    type="button"
                    className="pc-round small"
                    aria-label="Close"
                    onClick={close}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                </div>
                {toolBody}
              </section>
            </>
          )}
          <ToolTabs
            className="pc-tabbar"
            open={tool}
            onPick={pick}
            conditionCount={conditionCount}
          />
        </>
      )}

      {layout === 'phoneLandscape' && (
        <aside className="pc-railwrap">
          {tool && (
            <section className="pc-panel-tool" aria-label={toolTitle}>
              {toolBody}
            </section>
          )}
          <div className="pc-rail">
            <div className="pc-rail-hp" aria-label={`${me.name}: ${me.hp?.current ?? '—'} HP`}>
              <strong>{me.hp?.current ?? '—'}</strong>
              <span className="pc-bar" aria-hidden="true">
                <span className={band} style={{ width: `${pct}%` }} />
              </span>
            </div>
            <ToolTabs
              className="pc-railtabs"
              open={tool}
              onPick={pick}
              conditionCount={conditionCount}
            />
          </div>
        </aside>
      )}

      {(layout === 'wide' || layout === 'tabletPortrait') && (
        <aside className="pc-side">
          <div className="pc-side-nav">
            <Summary creature={me} variant="card" />
            <ToolTabs
              className="pc-sidetabs"
              open={tool}
              onPick={pick}
              conditionCount={conditionCount}
            />
          </div>
          <section className="pc-side-tool" aria-label={toolTitle}>
            {toolBody}
          </section>
        </aside>
      )}
    </main>
  );
}

/** The initiative box (decision 8): one number, then it goes. Floats over the top of the map. */
function InitiativeCard({
  creature,
  onSubmit,
}: {
  creature: CreatureView;
  onSubmit(value: number): void;
}) {
  const [value, setValue] = useState('');
  const ok = /^-?\d{1,2}$/.test(value);
  return (
    <form
      className="pc-initiative"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSubmit(Number(value));
      }}
    >
      <label className="pc-field">
        <span>Roll initiative for {creature.name} and enter what you got</span>
        <input
          inputMode="numeric"
          maxLength={3}
          aria-label="Initiative"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d-]/g, '').slice(0, 3))}
        />
      </label>
      <button type="submit" className="pc-btn primary" disabled={!ok}>
        Submit
      </button>
    </form>
  );
}
