import { useEffect, useState } from 'react';
import type { Character } from '@trifold/schema';
import { useCharacterStore } from '../../stores/characterStore';
import { Icon } from '../shell/icons';
import { ExternalForm } from './ExternalForm';
import { TrifoldSheet } from './TrifoldSheet';

/**
 * One character, open for editing (ADR 0068): its name, edition, Export and Delete above, and
 * the External character's table numbers or the Trifold character's sheet below. Every change is
 * saved a moment after it is made; leaving writes what is pending.
 */

/** Inline confirm for deleting a character: the player types DELETE, as for a campaign. */
function DeleteCharacterConfirm({
  character,
  onDelete,
  onCancel,
}: {
  character: Character;
  onDelete(): void;
  onCancel(): void;
}) {
  const [typed, setTyped] = useState('');
  const ready = typed === 'DELETE';
  return (
    <form
      className="campaign-delete"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onDelete();
      }}
    >
      <p className="small">
        Delete <strong>{character.name}</strong> from this Library. Campaigns linked to it keep what
        their GM accepted. Export it first to keep a copy. Type DELETE to confirm.
      </p>
      <div className="row">
        <input
          type="text"
          aria-label={`Type DELETE to delete ${character.name}`}
          placeholder="DELETE"
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel();
          }}
        />
        <button type="submit" className="btn danger" disabled={!ready}>
          Delete character
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Keep
        </button>
      </div>
    </form>
  );
}

export function CharacterEditor({ character, onBack }: { character: Character; onBack(): void }) {
  const change = useCharacterStore((s) => s.change);
  const flush = useCharacterStore((s) => s.flush);
  const remove = useCharacterStore((s) => s.remove);
  const exportFile = useCharacterStore((s) => s.exportFile);
  const [deleting, setDeleting] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const id = character.id;

  // Leaving the editor writes what is pending.
  useEffect(() => () => void flush(id), [flush, id]);

  return (
    <section className="character-editor" data-testid="character-editor">
      <div className="row character-head">
        <button type="button" className="btn" aria-label="Back to characters" onClick={onBack}>
          <Icon name="left" />
          Characters
        </button>
        <input
          type="text"
          className="grow character-name"
          aria-label="Character name"
          maxLength={80}
          value={character.name}
          onChange={(e) => change(id, { name: e.target.value })}
        />
        <select
          aria-label="Rules"
          value={character.edition}
          title="The rules this character is played under"
          onChange={(e) => change(id, { edition: e.target.value as Character['edition'] })}
        >
          <option value="2024">2024 rules</option>
          <option value="2014">Legacy rules</option>
        </select>
        <span className="row-actions">
          <button
            type="button"
            className="chrome-btn"
            aria-label={`Export ${character.name}`}
            title="Export: save a copy as a file"
            onClick={() => void exportFile(id).then((path) => setExported(path))}
          >
            <Icon name="send" />
          </button>
          <button
            type="button"
            className="chrome-btn danger"
            aria-label={`Delete ${character.name}`}
            title="Delete this character"
            onClick={() => setDeleting(true)}
          >
            <Icon name="trash" />
          </button>
        </span>
      </div>
      {exported && (
        <p className="muted small" role="status" data-testid="character-exported">
          Saved a copy to {exported}.
        </p>
      )}
      {deleting && (
        <DeleteCharacterConfirm
          character={character}
          onDelete={() => void remove(id)}
          onCancel={() => setDeleting(false)}
        />
      )}
      {character.kind === 'external' ? (
        <ExternalForm character={character} />
      ) : (
        <TrifoldSheet character={character} />
      )}
    </section>
  );
}
