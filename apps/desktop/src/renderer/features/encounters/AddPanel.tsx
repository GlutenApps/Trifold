import { useEffect, useRef, useState } from 'react';
import type { CompendiumRow } from '@trifold/api';
import type { NPC, PCCard } from '@trifold/schema';
import { Icon } from '../shell/icons';

/**
 * The one way to add fighters, in the builder and in a running fight: the creature search first,
 * then the party and the named NPCs not yet added, each on its own labelled lane. Whoever is
 * already in drops out, so the lanes only ever offer what is left.
 */
export function AddPanel({
  pcs,
  npcs,
  onAddPcs,
  onAddNpc,
  onAddCreature,
  withQuantity = false,
  autoFocus = false,
}: {
  /** Party members not yet added. */
  pcs: PCCard[];
  /** Named NPCs that can fight and are not yet added. */
  npcs: NPC[];
  onAddPcs(ids: string[]): void;
  onAddNpc(npc: NPC): void;
  onAddCreature(row: CompendiumRow, quantity: number): Promise<void> | void;
  /** Ask how many of the creature to add (the builder edits the count on the row instead). */
  withQuantity?: boolean;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CompendiumRow[]>([]);
  const [quantity, setQuantity] = useState(1);
  const debounce = useRef<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    if (!query.trim()) {
      setRows([]);
      return;
    }
    debounce.current = window.setTimeout(() => {
      window.trifold.compendium
        .search({ kind: 'monster', text: query, limit: 12, collapse: false })
        .then((r) => setRows(r.rows))
        .catch(() => setRows([]));
    }, 150);
  }, [query]);

  return (
    <div className="add-panel">
      <div className="add-search">
        <input
          ref={input}
          type="text"
          className="add-search-field"
          aria-label="Add creature"
          placeholder="Search creatures to add"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {withQuantity && (
          <label className="field inline">
            How many
            <input
              type="number"
              aria-label="How many"
              className="narrow"
              min={1}
              max={50}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
        )}
      </div>
      {rows.length > 0 && (
        <div className="picker" role="listbox" aria-label="Creature results">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              role="option"
              aria-selected={false}
              className="list-row"
              onClick={() => {
                void Promise.resolve(onAddCreature(r, Math.max(1, quantity))).then(() =>
                  setQuery(''),
                );
              }}
            >
              <span className="list-name">{r.displayName}</span>
              <span className="list-meta">
                {r.cr !== null && <span>CR {r.cr}</span>}
                {r.type && <span>{r.type}</span>}
                <span className="badge">{r.edition === '2014' ? 'legacy' : r.edition}</span>
                <span className="badge source">{r.sourceName}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {(pcs.length > 0 || npcs.length > 0) && (
        <div className="lanes">
          {pcs.length > 0 && (
            <>
              <span className="lane-label">Party</span>
              <div className="lane-line">
                {pcs.length > 1 && (
                  <button
                    type="button"
                    className="btn"
                    aria-label="Add all PCs"
                    title="Add everyone in the party not yet added"
                    onClick={() => onAddPcs(pcs.map((p) => p.id))}
                  >
                    <Icon name="party" />
                    All
                  </button>
                )}
                {pcs.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="btn"
                    aria-label={`Add ${p.name}`}
                    onClick={() => onAddPcs([p.id])}
                  >
                    <Icon name="plus" />
                    {p.name}
                  </button>
                ))}
              </div>
            </>
          )}
          {npcs.length > 0 && (
            <>
              <span className="lane-label">NPCs</span>
              <div className="lane-line">
                {npcs.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="btn"
                    aria-label={`Add ${n.name}`}
                    title={
                      n.hp ? `HP ${n.hp.current}/${n.hp.max} from the last fight` : 'Named NPC'
                    }
                    onClick={() => onAddNpc(n)}
                  >
                    <Icon name="plus" />
                    {n.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
