import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../shell/icons';

/**
 * The Party and NPCs tabs' one plus (ADR 0037): a menu of the ways to add one, the same on both
 * tabs. Party: Start blank, Import from another campaign. NPCs add Copy from the compendium.
 */
export interface AddChoice {
  label: string;
  icon: IconName;
  run(): void;
}

export function AddMenu({ label, choices }: { label: string; choices: readonly AddChoice[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <span
      className="menu-anchor"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className={`chrome-btn primary${open ? ' on' : ''}`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="plus" />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label={label}>
          {choices.map((c) => (
            <button
              key={c.label}
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setOpen(false);
                c.run();
              }}
            >
              <Icon name={c.icon} />
              {c.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
