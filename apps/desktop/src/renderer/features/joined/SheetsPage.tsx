import { useEffect, useMemo, useState } from 'react';
import type { CreatureView, TableIntent } from '@trifold/api';
import type { ConditionInstance } from '@trifold/schema';
import { useCharacterStore } from '../../stores/characterStore';
import { ExternalForm } from '../character/ExternalForm';
import { SheetView } from '../character/SheetView';
import { TrifoldSheet } from '../character/TrifoldSheet';
import { GuidedBuilder } from '../character/builder/GuidedBuilder';
import { useJoinedStore } from '../../stores/joinedStore';
import { HeldConditions } from '../campaign/HeldConditions';
import { HpChip, HpEditor } from '../campaign/HpBetweenFights';
import { useLinkedCharacter } from './CharacterLink';
import { conditionIntents, hpIntent } from './MyCharactersTool';
import { creatureKeyOf, orderMine, usePlayerTable } from './PlayerTable';

/**
 * Sheets (docs/PLAYER-MODE.md, "My characters and Sheets"; ADR 0069): the player console's
 * stage tab for the creature picked in My characters, in full. A switcher along the top mirrors
 * the dock's rows. The player's own character shows the linked character's sheet, with the
 * table's live HP and conditions above it while connected, and Edit on the sheet itself; a
 * companion or summon shows what the table sends of it, read only.
 */

/** The table's HP and conditions for one creature: the same controls and requests as its row. */
function LiveStatus({ creature }: { creature: CreatureView }) {
  const { conn } = usePlayerTable();
  const [open, setOpen] = useState(false);
  const send = (intent: TableIntent) =>
    conn.send({ type: 'intent', creatureKind: creature.kind, creatureId: creature.id, intent });
  const conditions: ConditionInstance[] = creature.conditions.map((x) => ({
    ...x,
    appliedRound: 0,
  }));
  return (
    <div className="sheet-live" data-testid="sheet-live">
      <div className="status-line">
        {creature.hp && creature.editable.hp ? (
          <HpChip
            name={creature.name}
            hp={creature.hp}
            open={open}
            onToggle={() => setOpen((v) => !v)}
          />
        ) : (
          <span className="muted small">
            {creature.hp ? `HP ${creature.hp.current}/${creature.hp.max}` : 'HP not tracked'}
          </span>
        )}
        {creature.editable.conditions ? (
          <HeldConditions
            name={creature.name}
            conditions={conditions}
            onChange={(next) => {
              for (const intent of conditionIntents(creature.conditions, next)) send(intent);
            }}
          />
        ) : (
          creature.conditions.map((x) => (
            <span key={x.id} className="badge warn">
              {x.name}
              {x.level ? ` ${x.level}` : ''}
            </span>
          ))
        )}
        {creature.turn && (
          <span className={`badge${creature.turn === 'now' ? ' on' : ''}`} role="status">
            {creature.turn === 'now' ? 'Your turn' : 'You’re next'}
          </span>
        )}
      </div>
      {open && creature.hp && (
        <HpEditor
          name={creature.name}
          hp={creature.hp}
          onChange={(change, amount) => send(hpIntent(creature, change, amount))}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/** A companion or summon: what the table sends of it, read only. */
function CompanionSheet({ creature, live }: { creature: CreatureView; live: boolean }) {
  return (
    <div className="sheet-view" data-testid="companion-sheet">
      <div className="sheet-view-head">
        <h2 className="sheet-view-name">{creature.name}</h2>
        <span className="muted small">
          {creature.summon ? `${creature.summon.type} · ` : ''}AC {creature.ac ?? '—'}
        </span>
      </div>
      {live ? (
        <LiveStatus creature={creature} />
      ) : (
        <p className="muted small">
          {creature.hp ? `HP ${creature.hp.current}/${creature.hp.max}` : 'HP not tracked'}
        </p>
      )}
    </div>
  );
}

export function SheetsPage() {
  const { conn, selected, select, last } = usePlayerTable();
  const { character, characterId, loaded } = useLinkedCharacter();
  const editing = useCharacterStore((s) => s.editingSheet);
  const setEditing = useCharacterStore((s) => s.setEditingSheet);
  const change = useCharacterStore((s) => s.change);
  const flush = useCharacterStore((s) => s.flush);
  const building = useCharacterStore((s) => s.building);
  const cancelBuilding = useCharacterStore((s) => s.cancelBuilding);
  const createBuilt = useCharacterStore((s) => s.createBuilt);
  const linkCharacter = useJoinedStore((s) => s.linkCharacter);
  const view = conn.link === 'open' ? conn.view : null;
  const mine = useMemo(
    () => orderMine(view?.mine ?? last?.view.mine ?? []),
    [view?.mine, last?.view.mine],
  );
  const me = mine[0];
  const shown = mine.find((c) => creatureKeyOf(c) === selected) ?? me;
  const ownShown = !shown || shown === me;

  // Leaving the tab, or another character, writes what is pending.
  useEffect(() => {
    if (!characterId) return;
    return () => void flush(characterId);
  }, [flush, characterId]);

  // The guided builder, opened from My characters (docs/BUILDER.md): Finish links what it made.
  if (building?.forJoined) {
    return (
      <div className="sheets-page" data-testid="sheets-page">
        <GuidedBuilder
          name={building.name}
          onCancel={cancelBuilding}
          onFinish={(sheet, build) =>
            void createBuilt(building.name, sheet, build).then(
              (made) => made && linkCharacter(made.id),
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="sheets-page" data-testid="sheets-page">
      {mine.length > 1 && (
        <div className="subtablist" role="tablist" aria-label="Whose sheet">
          {mine.map((c) => {
            const key = creatureKeyOf(c);
            const on = c === shown;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                className={`subtab${on ? ' active' : ''}`}
                aria-selected={on}
                onClick={() => select(key)}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      {!ownShown && shown ? (
        <CompanionSheet creature={shown} live={!!view} />
      ) : character ? (
        editing ? (
          <div className="sheets-editing" data-testid="sheet-editing">
            <div className="row character-head">
              <input
                type="text"
                className="grow character-name"
                aria-label="Character name"
                maxLength={80}
                value={character.name}
                onChange={(e) => change(character.id, { name: e.target.value })}
              />
              <button type="button" className="btn primary" onClick={() => setEditing(false)}>
                Done
              </button>
            </div>
            {character.kind === 'external' ? (
              <ExternalForm character={character} />
            ) : (
              <TrifoldSheet character={character} />
            )}
          </div>
        ) : (
          <SheetView
            character={character}
            onEdit={() => setEditing(true)}
            live={view && me ? <LiveStatus creature={me} /> : undefined}
          />
        )
      ) : (
        <div className="sheets-empty">
          <p className="muted" role="status">
            {!loaded
              ? 'Reading your characters…'
              : 'No character is linked to this campaign yet. Link one from your Library, or make a new one, under My characters.'}
          </p>
        </div>
      )}
    </div>
  );
}
