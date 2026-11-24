import { useEffect, useState, type ReactNode } from 'react';
import type { CompendiumRow } from '@trifold/api';
import type { Character, CompendiumRecord, SheetRef } from '@trifold/schema';
import { useCharacterStore } from '../../stores/characterStore';
import { useJoinedStore } from '../../stores/joinedStore';
import { Icon } from '../shell/icons';
import { LinkedText } from './LinkedRow';

/**
 * Forms (docs/PLAYER-MODE.md, "My characters and Sheets"): creature stat blocks a player pins for
 * a wild shape or any other transformation, kept on the character and shown as tabs on the
 * player console's Sheets tab. Reference only: the character's HP and token are untouched, as in
 * the 2024 rules, where a druid keeps their own hit points.
 */

const formRef = (r: Pick<CompendiumRecord | CompendiumRow, 'key' | 'displayName'>): SheetRef => ({
  kind: 'monster',
  key: r.key,
  name: r.displayName,
});

/** The character's forms, with a search to add one: in the character's editor. */
export function FormsSection({ character }: { character: Character }) {
  const change = useCharacterStore((s) => s.change);
  const forms = character.forms ?? [];
  const [text, setText] = useState('');
  const [found, setFound] = useState<CompendiumRow[]>([]);

  useEffect(() => {
    const q = text.trim();
    if (!q) {
      setFound([]);
      return;
    }
    let live = true;
    const t = window.setTimeout(() => {
      void window.trifold.compendium
        .search({ kind: 'monster', text: q, limit: 8 })
        .then((r) => live && setFound(r.rows))
        .catch(() => live && setFound([]));
    }, 150);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [text]);

  const add = (row: CompendiumRow) => {
    if (!forms.some((f) => f.key === row.key)) {
      change(character.id, { forms: [...forms, formRef(row)] });
    }
    setText('');
  };

  return (
    <section className="sheet-section" aria-label="Forms" data-testid="forms-section">
      <h2>Forms</h2>
      <p className="muted small">
        Stat blocks for a wild shape or another transformation, to read at the table. Your hit
        points and token stay your own.
      </p>
      {forms.length > 0 && (
        <ul className="sheet-rows" aria-label="Forms">
          {forms.map((f) => (
            <li key={f.key} className="sheet-row">
              <span className="grow">{f.name}</span>
              <span className="row-actions">
                <button
                  type="button"
                  className="chrome-btn xs danger"
                  aria-label={`Remove ${f.name}`}
                  title="Remove"
                  onClick={() =>
                    change(character.id, { forms: forms.filter((x) => x.key !== f.key) })
                  }
                >
                  <Icon name="trash" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <input
        type="search"
        aria-label="Add a form"
        placeholder="Add a form: search creatures"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {found.length > 0 && (
        <ul className="sheet-rows" aria-label="Creatures found">
          {found.map((r) => (
            <li key={r.id} className="sheet-row">
              <button type="button" className="btn" onClick={() => add(r)}>
                <Icon name="plus" />
                {r.displayName}
              </button>
              <span className="muted small">
                {r.cr ? `CR ${r.cr}` : ''} {r.sourceName}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Pin as a form, on a creature's compendium page in the player console: for the character linked
 * to the open joined campaign. Nowhere else: in the Library there is no one character to pin to.
 */
export function FormToggle({ record }: { record: CompendiumRecord }) {
  const characterId = useJoinedStore((s) => s.current?.characterId ?? null);
  const character = useCharacterStore((s) => s.characters.find((c) => c.id === characterId));
  const change = useCharacterStore((s) => s.change);
  if (record.kind !== 'monster' || !character) return null;
  const forms = character.forms ?? [];
  const on = forms.some((f) => f.key === record.key);
  return (
    <button
      type="button"
      className={`chrome-btn${on ? ' on' : ''}`}
      aria-label="Pin as a form"
      aria-pressed={on}
      title={
        on
          ? `${record.displayName} is one of ${character.name}’s forms. Click to unpin it`
          : `Pin ${record.displayName} as a form of ${character.name}, to read on the Sheets tab`
      }
      onClick={() =>
        change(character.id, {
          forms: on ? forms.filter((f) => f.key !== record.key) : [...forms, formRef(record)],
        })
      }
    >
      <Icon name="paw" />
    </button>
  );
}

/** A form on the Sheets tab: its stat block, under the character's own live HP and conditions. */
export function FormSheet({
  form,
  character,
  live,
}: {
  form: SheetRef;
  character: Character;
  /** The character's live HP and conditions, while at the table. */
  live?: ReactNode;
}) {
  return (
    <div className="sheet-view" data-testid="form-sheet">
      <div className="sheet-view-head">
        <h2 className="sheet-view-name">{form.name}</h2>
        <span className="muted small">
          A form of {character.name}. Hit points, conditions and the token stay {character.name}’s.
        </span>
      </div>
      {live}
      <LinkedText sheetRef={form} />
    </div>
  );
}
