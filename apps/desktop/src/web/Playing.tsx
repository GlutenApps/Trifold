import { useEffect, useMemo, useState } from 'react';
import type { ClientView, CreatureView, TableIntent } from '@trifold/api';
import type { Connection } from './connection';
import { AddCompanion } from './AddCompanion';
import { MapView, type DragHandlers, type MovePlan } from './MapView';
import { ScreenView } from './ScreenView';
import { TvBottom, TvTop } from './TvOverlays';
import { rulerLabel, squaresBetween } from '../renderer/features/presenter/ruler';
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
  // PCs first, each followed by its companions.
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
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (tool !== 'companions') setAdding(false);
  }, [tool]);
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
  // A move is a plan until Done (player feedback, 2026-11-15): the token waits where it was put,
  // the DM's Trifold holds it for this phone, and the TV shows the planned spot and the ruler.
  const [plan, setPlan] = useState<MovePlan | null>(null);
  const [holding, setHolding] = useState<string | null>(null);
  const preview = (tokenId: string, at: { x: number; y: number }, from: { x: number; y: number }) =>
    conn.send({ type: 'preview', tokenId, x: at.x, y: at.y, from });
  const cancelMove = () => {
    if (holding && !plan?.sending) conn.send({ type: 'letGo', tokenId: holding });
    setHolding(null);
    setPlan(null);
  };
  const confirmMove = () => {
    if (!plan || plan.sending) return;
    if (plan.at.x === plan.origin.x && plan.at.y === plan.origin.y) return cancelMove();
    conn.send({
      type: 'drop',
      tokenId: plan.tokenId,
      x: plan.at.x,
      y: plan.at.y,
      from: plan.origin,
    });
    setPlan({ ...plan, sending: true });
  };
  const drag: DragHandlers = {
    movable,
    plan,
    begin: (tokenId, origin) => {
      // Moving any token opens Move on that creature, and asks for Done.
      if (plan && plan.tokenId !== tokenId && !plan.sending) {
        conn.send({ type: 'letGo', tokenId: plan.tokenId });
        setPlan(null);
      }
      // A new move starts clean: an old refusal no longer applies.
      conn.clearError();
      if (holding !== tokenId) conn.send({ type: 'grab', tokenId });
      setHolding(tokenId);
      setTool('move');
      const hit = ordered.find((c) => c.tokenId === tokenId);
      if (hit) setTarget(creatureKey(hit));
      void origin;
    },
    dragging: (tokenId, at, origin) => preview(tokenId, at, origin),
    planned: (next) => {
      setPlan(next);
      preview(next.tokenId, next.at, next.origin);
    },
    ended: conn.dragEnded,
  };
  // The lock is kept alive while the player decides.
  useEffect(() => {
    if (!holding) return;
    const t = window.setInterval(() => conn.send({ type: 'hold', tokenId: holding }), 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding]);
  // The server ended the move (refused, lapsed, the DM took it): the plan goes.
  useEffect(() => {
    if (conn.dragEnded && conn.dragEnded.tokenId === (plan?.tokenId ?? holding)) {
      setPlan(null);
      setHolding(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn.dragEnded]);
  // Once the map shows the token where it was sent, the move is done.
  useEffect(() => {
    if (!plan?.sending) return;
    const t = view.map?.tokens.find((x) => x.id === plan.tokenId);
    if (!t || (t.x === plan.at.x && t.y === plan.at.y)) {
      setPlan(null);
      setHolding(null);
    }
  }, [view.map, plan]);
  // A sent move that the map never shows (lost on the way) never leaves the token stuck.
  useEffect(() => {
    if (!plan?.sending) return;
    const t = window.setTimeout(() => {
      setPlan(null);
      setHolding(null);
    }, 4000);
    return () => window.clearTimeout(t);
  }, [plan]);
  // Leaving Move with a plan unconfirmed cancels it.
  useEffect(() => {
    if (tool !== 'move' && plan && !plan.sending) cancelMove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);
  const planSquares = plan ? squaresBetween(plan.origin, plan.at) : 0;

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
    ) : tool === 'companions' && adding ? (
      <AddCompanion
        options={view.summoning?.options ?? []}
        onBack={() => setAdding(false)}
        onAdd={(option, chosen) => {
          // A summon belongs to the character it is summoned for: the main character here.
          const owner = me.kind === 'summon' ? null : { kind: me.kind, id: me.id };
          if (!owner) return;
          conn.send({
            type: 'summon',
            ownerKind: owner.kind,
            ownerId: owner.id,
            optionKey: option.key,
            count: chosen.count,
            initiative: chosen.initiative,
            ...(chosen.rounds ? { rounds: chosen.rounds } : {}),
            concentration: chosen.concentration,
            persistent: chosen.persistent,
          });
          setAdding(false);
        }}
      />
    ) : tool === 'companions' ? (
      <CompanionsTool
        companions={companions}
        footer={
          view.summoning?.mode === 'off' ? (
            <p className="pc-hint small">Your DM has turned summoning off.</p>
          ) : view.summoning ? (
            <button type="button" className="pc-add-comp" onClick={() => setAdding(true)}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add a companion
            </button>
          ) : null
        }
        onRemove={(c) =>
          // A summon leaves play; an NPC companion goes back to the DM.
          c.kind === 'summon'
            ? conn.send({ type: 'dismiss', tokenId: c.id })
            : conn.send({ type: 'releaseOne', creatureKind: c.kind, creatureId: c.id })
        }
      />
    ) : tool === 'move' ? (
      <>
        {chips}
        <MoveTool
          creature={current}
          planSquares={plan ? planSquares : null}
          sending={!!plan?.sending}
          // On a phone in portrait Move is a strip under the map, and its buttons also close it.
          closes={layout === 'phonePortrait'}
          onCancel={() => {
            cancelMove();
            if (layout === 'phonePortrait') close();
          }}
          onDone={() => {
            if (plan) confirmMove();
            if (layout === 'phonePortrait') close();
          }}
        />
      </>
    ) : null;
  const toolTitle = TOOLS.find((t) => t.id === tool)?.label ?? '';

  const initiative = ordered.filter((c) => c.needsInitiative);
  const phoneMove = tool === 'move' && layout === 'phonePortrait';
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  // The break screen covers everything on the TV, a live map included, so it does here too.
  const onBreak = view.screen?.kind === 'break';
  // What the TV shows over the scene (ADR 0046), under the break screen like on the TV.
  const tv = view.overlays && !onBreak ? view.overlays : null;
  const overlay = (
    <>
      <div className="pc-overlay-top" onPointerDown={stop} onPointerUp={stop}>
        {tv && <TvTop overlays={tv} />}
        {layout === 'phoneLandscape' && <div className="pc-pills">{header}</div>}
        {ordered
          .filter((c) => c.summon?.concentrationLost)
          .map((c) => (
            <div key={creatureKey(c)} className="pc-concentration" role="alert">
              <span>
                {me.name}’s concentration broke. {c.name} was tied to it: take it out of play?
              </span>
              <div className="pc-row">
                <button
                  type="button"
                  className="pc-btn"
                  onClick={() => conn.send({ type: 'keepSummon', tokenId: c.id })}
                >
                  Keep
                </button>
                <button
                  type="button"
                  className="pc-btn damage"
                  onClick={() => conn.send({ type: 'dismiss', tokenId: c.id })}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
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
        {tool === 'move' && !phoneMove && current.tokenId && !current.movementLocked && (
          <div className="pc-movebanner" role="status">
            {plan
              ? `Moving ${current.name}: ${rulerLabel(planSquares)}. Done to confirm.`
              : `Moving ${current.name}: drag the token or tap a spot.`}
          </div>
        )}
      </div>
      {tv && <TvBottom overlays={tv} />}
    </>
  );

  const map =
    view.map && !onBreak ? (
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
    ) : view.screen ? (
      <div className="pc-map pc-screen-wrap">
        <ScreenView screen={view.screen} />
        {overlay}
      </div>
    ) : (
      <div className="pc-map pc-center">
        {overlay}
        <p className="pc-hint" data-testid="pc-waiting">
          {view.live ? 'Nothing on the TV right now.' : 'Waiting for the DM to go live.'}
        </p>
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
          {tool === 'move' ? (
            // Move sits under the map, never over it, so it can't cover the token being moved.
            <section className="pc-movestrip" aria-label="Move">
              {toolBody}
            </section>
          ) : (
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

/**
 * The initiative box (PLAYER-CONNECTOR.md, "Initiative"): one number, then it goes. Floats over
 * the top of the map.
 */
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
