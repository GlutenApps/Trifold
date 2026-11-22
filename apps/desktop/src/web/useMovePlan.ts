import { useEffect, useMemo, useState } from 'react';
import type { ClientView } from '@trifold/api';
import type { Connection } from './connection';
import type { DragHandlers, MovePlan } from './MapView';
import { squaresBetween } from '../renderer/features/presenter/ruler';

/**
 * Moving one's own tokens (docs/PLAYER-CONNECTOR.md, "Movement"), the same on the phone page and
 * in the player console: a move is a plan until it is confirmed (player feedback, 2026-11-15).
 * The token waits where it was put, the DM's Trifold holds it for this device, and the TV shows
 * the planned spot and the ruler. `onBegin` is the host's chance to follow the token being
 * moved (the phone page opens Move on that creature).
 */
export function useMovePlan({
  view,
  conn,
  onBegin,
}: {
  view: ClientView;
  conn: Connection;
  onBegin?: (tokenId: string) => void;
}) {
  const movable = useMemo(
    () => new Set(view.mine.flatMap((c) => (c.tokenId && !c.movementLocked ? [c.tokenId] : []))),
    [view.mine],
  );
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
    begin: (tokenId) => {
      if (plan && plan.tokenId !== tokenId && !plan.sending) {
        conn.send({ type: 'letGo', tokenId: plan.tokenId });
        setPlan(null);
      }
      // A new move starts clean: an old refusal no longer applies.
      conn.clearError();
      if (holding !== tokenId) conn.send({ type: 'grab', tokenId });
      setHolding(tokenId);
      onBegin?.(tokenId);
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

  return {
    plan,
    drag,
    cancelMove,
    confirmMove,
    planSquares: plan ? squaresBetween(plan.origin, plan.at) : 0,
  };
}
