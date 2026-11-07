import { ulid } from 'ulid';
import type { CompendiumRow } from '@trifold/api';
import type { CombatantTemplate, NPC } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { Icon } from '../shell/icons';
import { AddPanel } from './AddPanel';

/**
 * The tracker's add panel (DESIGN.md §6.4): the same AddPanel the builder uses, wired to the
 * combat store's `addToFight` so a newcomer joins the running fight and its encounter.
 */
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

  const fightingPcs = new Set(combatants.flatMap((c) => (c.ref.kind === 'pc' ? [c.ref.pcId] : [])));
  const fightingNpcs = new Set(
    combatants.flatMap((c) => (c.ref.kind === 'npc' ? [c.ref.npcId] : [])),
  );
  const waitingPcs = pcs.filter((p) => !fightingPcs.has(p.id));
  const waitingNpcs = npcs.filter((n) => (n.recordRef || n.hp) && !fightingNpcs.has(n.id));

  const addCreature = async (row: CompendiumRow, quantity: number) => {
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
      quantity,
      role: 'enemy',
      hidden: false,
      cache,
    };
    await addToFight(template);
  };

  return (
    <div className="card add-to-fight" role="region" aria-label="Add to the fight">
      <div className="row">
        <h3>Add to the fight</h3>
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
      <AddPanel
        pcs={waitingPcs}
        npcs={waitingNpcs}
        withQuantity
        autoFocus
        onAddPcs={(ids) => {
          // One at a time: each add saves the encounter's templates from the last one's result.
          void (async () => {
            for (const p of waitingPcs.filter((x) => ids.includes(x.id))) {
              await addToFight({
                id: ulid(),
                ref: { kind: 'pc', pcId: p.id, name: p.name },
                quantity: 1,
                role: 'ally',
                hidden: false,
              });
            }
          })();
        }}
        onAddNpc={(n) =>
          void addToFight({
            id: ulid(),
            ref: { kind: 'npc', npcId: n.id, name: n.name },
            quantity: 1,
            role: 'enemy',
            hidden: false,
          })
        }
        onAddCreature={addCreature}
      />
    </div>
  );
}
