import { useEffect, useRef, useState } from 'react';
import { ulid } from 'ulid';
import type { CompendiumRow } from '@trifold/api';
import type { CombatantTemplate, NPC } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { Icon } from '../shell/icons';

const NO_NPCS: NPC[] = [];

/**
 * Adds fighters to the running fight without leaving it: the party members and named NPCs
 * not yet in it as one-tap buttons, and a creature search with a quantity. Everything added
 * joins in initiative order and is kept on the encounter.
 */
export function AddToFight({ onClose }: { onClose(): void }) {
  const pcs = useCampaignStore((s) => s.current?.pcs ?? []);
  const npcs = useCampaignStore((s) => s.current?.npcs ?? NO_NPCS);
  const combatants = useCombatStore((s) => s.state?.combatants ?? []);
  const addToFight = useCombatStore((s) => s.addToFight);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CompendiumRow[]>([]);
  const [quantity, setQuantity] = useState(1);
  const debounce = useRef<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);

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

  const fightingPcs = new Set(combatants.flatMap((c) => (c.ref.kind === 'pc' ? [c.ref.pcId] : [])));
  const fightingNpcs = new Set(
    combatants.flatMap((c) => (c.ref.kind === 'npc' ? [c.ref.npcId] : [])),
  );
  const waitingPcs = pcs.filter((p) => !fightingPcs.has(p.id));
  const waitingNpcs = npcs.filter((n) => (n.recordRef || n.hp) && !fightingNpcs.has(n.id));

  const addCreature = async (row: CompendiumRow) => {
    const record = await window.trifold.compendium.get(row.id).catch(() => null);
    const cache =
      record?.kind === 'monster'
        ? {
            xp: record.data.xp,
            cr: record.data.cr,
            type: record.data.type,
            hp: record.data.hp?.average ?? 0,
            ac: record.data.ac?.value ?? 10,
          }
        : { xp: 0, cr: row.cr ?? '', type: row.type ?? '', hp: 0, ac: 10 };
    const template: CombatantTemplate = {
      id: ulid(),
      ref: {
        kind: 'record',
        ref: {
          recordId: row.id,
          sourceId: row.sourceId,
          key: row.key,
          edition: row.edition as 'unknown',
        },
        name: row.displayName,
      },
      quantity: Math.max(1, quantity),
      role: 'enemy',
      hidden: false,
      cache,
    };
    await addToFight(template);
    setQuery('');
  };

  return (
    <div className="card add-to-fight" role="region" aria-label="Add to the fight">
      <div className="row">
        <strong>Add to the fight</strong>
        <span className="spacer" />
        <button
          type="button"
          className="chrome-btn xs"
          aria-label="Close add to fight"
          title="Close"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {(waitingPcs.length > 0 || waitingNpcs.length > 0) && (
        <div className="row">
          {waitingPcs.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn"
              aria-label={`Add ${p.name}`}
              onClick={() =>
                void addToFight({
                  id: ulid(),
                  ref: { kind: 'pc', pcId: p.id, name: p.name },
                  quantity: 1,
                  role: 'ally',
                  hidden: false,
                })
              }
            >
              <Icon name="plus" />
              {p.name}
            </button>
          ))}
          {waitingNpcs.map((n) => (
            <button
              key={n.id}
              type="button"
              className="btn"
              aria-label={`Add ${n.name}`}
              title={n.hp ? `HP ${n.hp.current}/${n.hp.max} from the last fight` : 'Named NPC'}
              onClick={() =>
                void addToFight({
                  id: ulid(),
                  ref: { kind: 'npc', npcId: n.id, name: n.name },
                  quantity: 1,
                  role: 'enemy',
                  hidden: false,
                })
              }
            >
              <Icon name="plus" />
              {n.name}
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <input
          ref={input}
          type="text"
          aria-label="Add creature"
          placeholder="Search creatures to add"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="field inline">
          ×
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
              onClick={() => void addCreature(r)}
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
    </div>
  );
}
