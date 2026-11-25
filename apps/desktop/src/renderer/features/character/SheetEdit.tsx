import { useEffect, useRef, useState } from 'react';
import type { CompendiumRow } from '@trifold/api';
import type { SheetItem } from '@trifold/schema';
import { Icon } from '../shell/icons';
import { NumField } from './fields';

/**
 * Changing a sheet where it is read (docs/CHARACTER-SHEET.md; ADR 0082): adding a spell or an item
 * from the compendium in its own tab, and changing an item in place. The editor keeps the same
 * fields; this is so a player never has to leave the tab for it.
 */

/** What an add gives: a compendium row picked, or a name typed and added as written. */
export type Added = { row: CompendiumRow } | { name: string; level: number };

/**
 * The search an Add button opens at the top of its tab: compendium records of one kind as you
 * type, each added with a click, and what was typed added as written. Escape or Close puts it away.
 */
export function AddPanel({
  kind,
  onAdd,
  onClose,
}: {
  kind: 'spell' | 'item';
  onAdd(added: Added): void;
  onClose(): void;
}) {
  const [text, setText] = useState('');
  const [found, setFound] = useState<CompendiumRow[]>([]);
  const [level, setLevel] = useState(1);
  const input = useRef<HTMLInputElement>(null);
  const noun = kind === 'spell' ? 'spell' : 'item';

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const q = text.trim();
    if (!q) {
      setFound([]);
      return;
    }
    let live = true;
    const t = window.setTimeout(() => {
      void window.trifold.compendium
        .search({ kind, text: q, limit: 8 })
        .then((r) => live && setFound(r.rows))
        .catch(() => live && setFound([]));
    }, 150);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [text, kind]);

  const typed = text.trim();
  const add = (added: Added) => {
    onAdd(added);
    setText('');
    input.current?.focus();
  };

  return (
    <div
      className="sh-add"
      role="group"
      aria-label={`Add a ${noun}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="sh-add-head">
        <input
          ref={input}
          type="search"
          aria-label={`Search ${noun}s to add`}
          placeholder={`Search ${noun}s`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="button"
          className="chrome-btn xs"
          aria-label={`Close adding a ${noun}`}
          title="Close"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {found.length > 0 && (
        <ul className="sh-add-list" aria-label={`${kind === 'spell' ? 'Spells' : 'Items'} found`}>
          {found.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="sh-add-pick"
                aria-label={`Add ${r.displayName}`}
                onClick={() => add({ row: r })}
              >
                <Icon name="plus" size={14} />
                <span className="sh-name">{r.displayName}</span>
                <span className="sh-src">
                  {kind === 'spell'
                    ? r.level === 0
                      ? 'Cantrip'
                      : `Level ${r.level ?? '?'}`
                    : (r.rarity ?? '')}
                  {' · '}
                  {r.sourceName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {typed && (
        <div className="sh-add-own">
          <button
            type="button"
            className="btn small"
            onClick={() => add({ name: typed.slice(0, 120), level: kind === 'spell' ? level : 0 })}
          >
            <Icon name="plus" />
            Add “{typed.length > 40 ? `${typed.slice(0, 40)}…` : typed}” as written
          </button>
          {kind === 'spell' && (
            <select
              aria-label="Level of the spell added as written"
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
            >
              {Array.from({ length: 10 }, (_, l) => (
                <option key={l} value={l}>
                  {l === 0 ? 'Cantrip' : `Level ${l}`}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * An item changed in place, under its row: its name, how many, where it is kept and its charges.
 * Each change saves as it is made, as the editor's fields do.
 */
export function ItemEditor({
  item,
  places,
  onChange,
  onDone,
}: {
  item: SheetItem;
  /** Places to offer: those the sheet uses, then the usual ones. */
  places: readonly string[];
  onChange(patch: Partial<SheetItem>): void;
  onDone(): void;
}) {
  const name = item.name || 'Item';
  const listId = `places-${item.id}`;
  return (
    <div
      className="sh-item-edit"
      role="group"
      aria-label={`Change ${name}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onDone();
        }
      }}
    >
      <label className="field">
        Name
        <input
          type="text"
          aria-label={`${name} name`}
          maxLength={120}
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>
      <label className="field">
        How many
        <NumField
          label={`${name} quantity`}
          value={item.quantity}
          min={0}
          max={9999}
          onChange={(v) => v !== undefined && onChange({ quantity: v })}
        />
      </label>
      <label className="field">
        Kept
        <input
          type="text"
          aria-label={`${name} place`}
          placeholder="On you"
          list={listId}
          maxLength={60}
          value={item.place ?? ''}
          onChange={(e) => onChange({ place: e.target.value || undefined })}
        />
        <datalist id={listId}>
          {places.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </label>
      <label className="field">
        Charges
        <NumField
          label={`${name} charges`}
          value={item.uses?.max}
          min={1}
          max={99}
          optional
          onChange={(v) =>
            onChange({
              uses:
                v === undefined
                  ? undefined
                  : {
                      max: v,
                      used: Math.min(v, item.uses?.used ?? 0),
                      reset: item.uses?.reset ?? 'dawn',
                    },
            })
          }
        />
      </label>
      {item.uses && (
        <label className="field">
          Come back
          <select
            aria-label={`${name} charges come back`}
            value={item.uses.reset}
            onChange={(e) =>
              onChange({
                uses: { ...item.uses!, reset: e.target.value as 'short' | 'long' | 'dawn' },
              })
            }
          >
            <option value="dawn">at dawn</option>
            <option value="long">on a long rest</option>
            <option value="short">on a short rest</option>
          </select>
        </label>
      )}
      <button type="button" className="btn small" onClick={onDone}>
        Done
      </button>
    </div>
  );
}

/**
 * Casting with a higher slot (docs/CHARACTER-SHEET.md, item 13): a row action beside Cast that
 * opens the slot levels above the one Cast would use, each with how many are left. It keeps its
 * place on every spell row, disabled with the reason where there is nothing to choose (UI
 * guidelines §8). Escape or a click elsewhere closes it.
 */
export function UpcastMenu({
  name,
  choices,
  why,
  onCast,
}: {
  name: string;
  choices: readonly { level: number; left: number }[];
  /** Why it cannot open; empty when it can. */
  why: string;
  onCast(slotLevel: number): void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    anchor.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const close = (e: MouseEvent) => {
      if (!anchor.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <span
      className="menu-anchor"
      ref={anchor}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="chrome-btn xs"
        disabled={!!why}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Cast ${name} with a higher slot`}
        title={why || 'Cast with a higher slot'}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="up" />
      </button>
      {open && (
        <div className="menu sh-upcast" role="menu" aria-label={`Cast ${name} with`}>
          {choices.map((c) => (
            <button
              key={c.level}
              type="button"
              role="menuitem"
              disabled={c.left === 0}
              onClick={() => {
                setOpen(false);
                onCast(c.level);
              }}
            >
              Level {c.level} slot
              <span className="muted small">{c.left === 0 ? 'none left' : `${c.left} left`}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
