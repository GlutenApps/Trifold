import { useLayoutEffect, useRef, useState } from 'react';
import type { CombatSummary } from '@trifold/api';

/** The order from the creature whose turn it is: who is up now, then who is up next. */
export function fromActive<T extends { id: string }>(
  entries: readonly T[],
  activeId: string | null,
) {
  const at = entries.findIndex((e) => e.id === activeId);
  return at <= 0 ? [...entries] : [...entries.slice(at), ...entries.slice(0, at)];
}

/** Chip size for a fight this big: big fights get smaller chips before any fold away. */
export function stripSize(count: number): 'l' | 'm' | 's' {
  return count <= 6 ? 'l' : count <= 10 ? 'm' : 's';
}

/**
 * The TV's initiative strip (DESIGN.md §6.5): one row that never covers more of the map. It
 * starts at whoever's turn it is and runs on through the order, so the next few turns are always
 * in view; chips shrink in a big fight, and those that still do not fit fold into a "+N" chip at
 * the end, coming back into view as their turns draw near.
 */
export function InitiativeStrip({
  combat,
  healthBars,
}: {
  combat: CombatSummary;
  healthBars: boolean;
}) {
  const order = fromActive(combat.entries, combat.activeId);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [shown, setShown] = useState(order.length);
  const key = order.map((e) => `${e.id}:${e.name}`).join('|');

  // Measure every chip (folded ones stay measurable, out of the flow) and keep as many as fit
  // beside the "+N" chip in the room the title leaves.
  useLayoutEffect(() => {
    const measure = () => {
      const room = wrap.current?.clientWidth ?? 0;
      const ol = list.current;
      if (!ol || room <= 0) return setShown(order.length);
      const chips = [...ol.querySelectorAll<HTMLElement>('li.chip')];
      const more = ol.querySelector<HTMLElement>('li.chip-more');
      const style = getComputedStyle(ol);
      const gap = parseFloat(style.columnGap) || 0;
      const pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const widths = chips.map((c) => c.offsetWidth);
      const all = widths.reduce((sum, w) => sum + w + gap, pad - gap);
      if (all <= room) return setShown(chips.length);
      const reserve = (more?.offsetWidth ?? 0) + gap;
      let used = pad + reserve - gap;
      let fit = 0;
      for (const w of widths) {
        if (used + w + gap > room) break;
        used += w + gap;
        fit += 1;
      }
      setShown(Math.max(1, fit));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (wrap.current) observer?.observe(wrap.current);
    return () => observer?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, healthBars]);

  const folded = order.length - Math.min(shown, order.length);
  return (
    <div className="initiative-wrap" ref={wrap}>
      <ol
        ref={list}
        className="initiative-strip"
        data-size={stripSize(order.length)}
        aria-label="Initiative"
      >
        {order.map((e, i) => (
          <li
            key={e.id}
            className={`chip role-${e.role}${e.id === combat.activeId ? ' active' : ''}${e.dead ? ' dead' : ''}${e.bloodied ? ' bloodied' : ''}${i >= shown ? ' folded' : ''}`}
            aria-hidden={i >= shown ? true : undefined}
          >
            <span className="chip-name">{e.name}</span>
            {e.hpFraction !== undefined && healthBars && (
              <span className="hp-bar" aria-label={`${Math.round(e.hpFraction * 100)}% health`}>
                <span className="hp-fill" style={{ width: `${Math.round(e.hpFraction * 100)}%` }} />
              </span>
            )}
          </li>
        ))}
        <li
          className={`chip chip-more${folded ? '' : ' folded'}`}
          data-testid="initiative-more"
          aria-label={folded ? `${folded} more later in the order` : undefined}
          aria-hidden={folded ? undefined : true}
        >
          <span className="chip-name">+{folded || order.length}</span>
        </li>
      </ol>
    </div>
  );
}
