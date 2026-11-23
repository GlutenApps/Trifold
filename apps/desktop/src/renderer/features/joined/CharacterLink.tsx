import { useEffect, useState } from 'react';
import { useCharacterStore } from '../../stores/characterStore';
import { useJoinedStore } from '../../stores/joinedStore';
import { useShellStore } from '../../stores/shellStore';
import { NewCharacterPanel } from '../character/CharactersPage';
import { usePlayerTable } from './PlayerTable';

/**
 * Which of the player's characters is linked to this joined campaign (docs/PLAYER-MODE.md, "My
 * characters and Sheets"; ADR 0069): with none, **Link a character** from the Library or
 * **New character**, which makes one and opens it in Sheets to fill in; with one, its name and
 * Unlink. The link is kept in `joined.json`; the character stays in the Library.
 */

/** Brings Sheets forward on the player's sheet, reading or editing. */
export function openSheet(edit: boolean): void {
  useCharacterStore.getState().setEditingSheet(edit);
  useShellStore.getState().openMajor('sheets');
}

/** The open joined campaign's linked character, loading the Library's characters once. */
export function useLinkedCharacter() {
  const characterId = useJoinedStore((s) => s.current?.characterId ?? null);
  const characters = useCharacterStore((s) => s.characters);
  const loaded = useCharacterStore((s) => s.loaded);
  const load = useCharacterStore((s) => s.load);
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  return {
    characterId,
    character: characters.find((c) => c.id === characterId) ?? null,
    characters,
    loaded,
  };
}

export function CharacterLink() {
  const { characterId, character, characters, loaded } = useLinkedCharacter();
  const linkCharacter = useJoinedStore((s) => s.linkCharacter);
  const [making, setMaking] = useState(false);
  // The GM's answer to the sheet's numbers (ADR 0071), sent by main when they change.
  const answer = usePlayerTable().conn.sheetAnswer;

  if (characterId && character) {
    return (
      <div className="row character-link" data-testid="character-link">
        <span className="muted small grow">
          Your sheet: <strong>{character.name}</strong>
          {answer && (
            <span role="status" data-testid="sheet-answer">
              {answer.accepted
                ? ' · Your GM took its numbers.'
                : ' · Your GM kept the numbers they have.'}
            </span>
          )}
        </span>
        <button
          type="button"
          className="btn small"
          title="Unlink: the character stays in your Library"
          onClick={() => void linkCharacter(null)}
        >
          Unlink
        </button>
      </div>
    );
  }

  if (making) {
    return (
      <NewCharacterPanel
        onCreated={(made) => {
          void linkCharacter(made.id).then(() => openSheet(true));
        }}
        onClose={() => setMaking(false)}
      />
    );
  }

  return (
    <div className="character-link" data-testid="character-link">
      {characterId && loaded && (
        <p className="muted small" role="status">
          The character linked here is no longer in your Library.
        </p>
      )}
      <div className="row">
        <select
          aria-label="Link a character"
          value=""
          disabled={characters.length === 0}
          onChange={(e) => {
            if (e.target.value) void linkCharacter(e.target.value);
          }}
        >
          <option value="">
            {characters.length === 0 ? 'No characters in your Library' : 'Link a character…'}
          </option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn small" onClick={() => setMaking(true)}>
          New character
        </button>
      </div>
    </div>
  );
}
