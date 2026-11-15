import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './icons';

/**
 * A row of sub-tabs that never scrolls (ADR 0042): the tabs that fit show in their order, the
 * rest fold into **More**, and the open tab always shows even when it is late in the order. The
 * width of each tab is measured from a hidden copy of the row, so a long label folds earlier
 * than a short one and a wider panel brings tabs back.
 */
export interface SubTab<T extends string> {
  id: T;
  label: string;
}

/** Which tabs show for a row this wide; the rest go in More. Pure, so it can be tested. */
export function fitTabs<T extends string>(
  tabs: readonly SubTab<T>[],
  widths: readonly number[],
  available: number,
  moreWidth: number,
  active: T,
): T[] {
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (total <= available) return tabs.map((t) => t.id);
  const room = available - moreWidth;
  const activeIndex = tabs.findIndex((t) => t.id === active);
  const activeWidth = activeIndex >= 0 ? (widths[activeIndex] ?? 0) : 0;
  const shown: T[] = [];
  let used = 0;
  // Tabs fold from the end of the order: once one does not fit, the rest go to More too.
  let full = false;
  tabs.forEach((tab, i) => {
    const w = widths[i] ?? 0;
    // The open tab always shows; room is kept for it while earlier tabs are placed.
    const reserve = activeIndex > i ? activeWidth : 0;
    if (tab.id === active) {
      shown.push(tab.id);
      used += w;
    } else if (!full && used + w + reserve <= room) {
      shown.push(tab.id);
      used += w;
    } else full = true;
  });
  return shown;
}

export function SubTabs<T extends string>({
  label,
  tabs,
  active,
  onSelect,
}: {
  /** The tab list's accessible name, e.g. "Record kind". */
  label: string;
  tabs: readonly SubTab<T>[];
  active: T;
  onSelect(id: T): void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [widths, setWidths] = useState<number[]>([]);
  const [moreWidth, setMoreWidth] = useState(0);
  const [open, setOpen] = useState(false);
  const labels = tabs.map((t) => t.label).join('\u0000');

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Each label's width, from the hidden copy (fonts and labels change it, the panel does not).
  useLayoutEffect(() => {
    const row = measureRef.current;
    if (!row) return;
    const buttons = [...row.querySelectorAll<HTMLElement>('[data-measure]')];
    setWidths(buttons.slice(0, -1).map((b) => b.offsetWidth + 2));
    setMoreWidth((buttons[buttons.length - 1]?.offsetWidth ?? 0) + 8);
  }, [labels]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const shownIds =
    width > 0 && widths.length === tabs.length
      ? fitTabs(tabs, widths, width, moreWidth, active)
      : tabs.map((t) => t.id);
  const shown = tabs.filter((t) => shownIds.includes(t.id));
  const folded = tabs.filter((t) => !shownIds.includes(t.id));

  return (
    <div className="subtabbar" ref={barRef}>
      <div className="subtablist" role="tablist" aria-label={label}>
        {shown.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`subtab${t.id === active ? ' active' : ''}`}
            aria-selected={t.id === active}
            onClick={() => onSelect(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {folded.length > 0 && (
        <div
          className="menu-anchor subtab-more"
          ref={menuRef}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <button
            type="button"
            className={`subtab${open ? ' open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={`More: ${folded.map((t) => t.label).join(', ')}`}
            title={folded.map((t) => t.label).join(', ')}
            onClick={() => setOpen((v) => !v)}
          >
            More
            <Icon name="down" size={14} />
          </button>
          {open && (
            <div className="menu" role="menu" aria-label={`More ${label.toLowerCase()}`}>
              {folded.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    setOpen(false);
                    onSelect(t.id);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {/* The hidden copy every width is measured from: each tab, then More. */}
      <div className="subtab-measure" ref={measureRef} aria-hidden="true">
        {tabs.map((t) => (
          <span key={t.id} className="subtab" data-measure>
            {t.label}
          </span>
        ))}
        <span className="subtab" data-measure>
          More
          <Icon name="down" size={14} />
        </span>
      </div>
    </div>
  );
}
