import { useEffect, useMemo, useState } from 'react';
import type { CreatureView, TableIntent } from '@trifold/api';
import { statBlockRecordId } from '@trifold/rules';
import type { CompendiumRecord, ConditionInstance } from '@trifold/schema';
import { RecordBody } from '../compendium/RecordDetail';
import { useCharacterStore } from '../../stores/characterStore';
import { Icon } from '../shell/icons';
import { ExternalForm } from '../character/ExternalForm';
import { SheetView } from '../character/SheetView';
import { TrifoldSheet } from '../character/TrifoldSheet';
import { GuidedBuilder } from '../character/builder/GuidedBuilder';
import { PdfImport } from '../character/PdfImport';
import { FormSheet, FormsSection } from '../character/Forms';
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
 * companion or summon shows its stat block, read only, with the table's live HP and conditions
 * above it. The stat block is the GM's shared copy or the bundled SRD's; without one, what the
 * table sends of it.
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

/**
 * A creature's stat block as this Trifold has it: the shared copy the GM sent, or the bundled
 * SRD's, by record id; then any version by key. `'reading'` until it is known; null for none.
 */
function useStatBlock(creature: CreatureView): CompendiumRecord | null | 'reading' {
  const campaignId = useJoinedStore((s) => s.current?.campaignId ?? null);
  const [record, setRecord] = useState<CompendiumRecord | null | 'reading'>('reading');
  const recordId = creature.statBlock?.recordId;
  const key = creature.statBlock?.key;
  useEffect(() => {
    if (!recordId || !key || !campaignId) {
      setRecord(null);
      return;
    }
    setRecord('reading');
    let live = true;
    const id = statBlockRecordId(campaignId, { recordId, key });
    void (async () => {
      const exact = await window.trifold.compendium.get(id).catch(() => null);
      const found =
        exact ??
        (await window.trifold.compendium.findByKey('monster', key).catch(() => []))[0] ??
        null;
      if (live) setRecord(found?.kind === 'monster' ? found : null);
    })();
    return () => {
      live = false;
    };
  }, [campaignId, recordId, key]);
  return record;
}

/** A companion or summon: its stat block, read only, under the table's live numbers. */
function CompanionSheet({ creature, live }: { creature: CreatureView; live: boolean }) {
  const record = useStatBlock(creature);
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
      {record === 'reading' ? null : record ? (
        <div className="sheet-view-section" data-testid="companion-statblock">
          <RecordBody record={record} onOpenSpell={() => undefined} />
        </div>
      ) : (
        creature.statBlock && (
          <p className="muted small">
            Its stat block is not on this computer yet. It arrives with what your GM shares when you
            are at the table.
          </p>
        )
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
  const createImported = useCharacterStore((s) => s.createImported);
  const linkCharacter = useJoinedStore((s) => s.linkCharacter);
  const view = conn.link === 'open' ? conn.view : null;
  const mine = useMemo(
    () => orderMine(view?.mine ?? last?.view.mine ?? []),
    [view?.mine, last?.view.mine],
  );
  const me = mine[0];
  const shown = mine.find((c) => creatureKeyOf(c) === selected) ?? me;
  /** A form picked on the switcher (by key); a creature's tab puts it away. */
  const [formKey, setFormKey] = useState<string | null>(null);
  const forms = character?.forms ?? [];
  const form = forms.find((f) => f.key === formKey) ?? null;
  const ownShown = !shown || shown === me;

  // Leaving the tab, or another character, writes what is pending.
  useEffect(() => {
    if (!characterId) return;
    return () => void flush(characterId);
  }, [flush, characterId]);

  // Import from PDF (ADR 0073), opened from My characters: Create links what it made.
  if (building?.forJoined && building.way === 'pdf') {
    return (
      <div className="sheets-page" data-testid="sheets-page">
        <PdfImport
          name={building.name}
          onCancel={cancelBuilding}
          onDone={(preview, name, edition) =>
            void createImported(name, preview, edition).then(
              (made) => made && linkCharacter(made.id),
            )
          }
        />
      </div>
    );
  }

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
      {(mine.length > 1 || forms.length > 0) && (
        <div className="subtablist" role="tablist" aria-label="Whose sheet">
          {mine.map((c) => {
            const key = creatureKeyOf(c);
            const on = !form && c === shown;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                className={`subtab${on ? ' active' : ''}`}
                aria-selected={on}
                onClick={() => {
                  setFormKey(null);
                  select(key);
                }}
              >
                {c.name}
              </button>
            );
          })}
          {mine.length === 0 && character && (
            <button
              type="button"
              role="tab"
              className={`subtab${form ? '' : ' active'}`}
              aria-selected={!form}
              onClick={() => setFormKey(null)}
            >
              {character.name}
            </button>
          )}
          {/* Forms (reference only) follow the creatures. */}
          {forms.map((f) => (
            <button
              key={`form:${f.key}`}
              type="button"
              role="tab"
              className={`subtab${form === f ? ' active' : ''}`}
              aria-selected={form === f}
              title={`${f.name}: a form of ${character?.name ?? 'your character'}`}
              onClick={() => setFormKey(f.key)}
            >
              <Icon name="paw" size={13} />
              {f.name}
            </button>
          ))}
        </div>
      )}

      {form && character ? (
        <FormSheet
          form={form}
          character={character}
          live={view && me ? <LiveStatus creature={me} /> : undefined}
        />
      ) : !ownShown && shown ? (
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
            <FormsSection character={character} />
          </div>
        ) : (
          <SheetView
            character={character}
            onEdit={() => setEditing(true)}
            live={view && me ? <LiveStatus creature={me} /> : undefined}
            // Rolling (ADR 0075): an initiative roll while the fight waits for it is entered there.
            rolls={{
              actor: me?.name ?? character.name,
              ...(view && me?.needsInitiative
                ? {
                    initiative: { creatureKind: me.kind, creatureId: me.id },
                    onInitiative: (value: number) =>
                      conn.send({
                        type: 'intent',
                        creatureKind: me.kind,
                        creatureId: me.id,
                        intent: { kind: 'initiative', value },
                      }),
                  }
                : {}),
            }}
            // Resources (ADR 0074): a hit die's healing goes to the table as an HP change.
            resources={{
              onChange: (next) => change(character.id, { sheet: next }),
              ...(view && me
                ? {
                    onHeal: (amount: number) =>
                      conn.send({
                        type: 'intent',
                        creatureKind: me.kind,
                        creatureId: me.id,
                        intent: { kind: 'hp', delta: amount },
                      }),
                  }
                : {}),
            }}
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
