import { useState } from 'react';
import { normalizeKey } from '@trifold/rules';
import { useJoinedStore } from '../../stores/joinedStore';
import { NewCharacterPanel } from '../character/CharactersPage';
import { openSheet, useLinkedCharacter } from './CharacterLink';

/**
 * Setting up a character at the table (ADR 0078). Holding a PC with no sheet linked, the player
 * is asked for one on the VTT tab: a character of their Library (one named like the PC first),
 * a new one built or imported from a PDF with the PC's name, or not now. Holding nothing, the
 * same choices make the character they bring, which they then ask the GM to add.
 *
 * Linking sends the sheet's numbers to the GM to accept (ADR 0071) and the sheet itself to read
 * on the PC card (ADR 0078); nothing else is needed from the player.
 */
export function SheetSetup({
  pcName,
  onNotNow,
}: {
  /** The PC held; absent while the player holds nothing and brings a new character. */
  pcName?: string;
  onNotNow?(): void;
}) {
  const { characters, loaded } = useLinkedCharacter();
  const linkCharacter = useJoinedStore((s) => s.linkCharacter);
  const [making, setMaking] = useState<'guided' | 'pdf' | null>(null);
  const match = pcName
    ? characters.find((c) => normalizeKey(c.name) === normalizeKey(pcName))
    : undefined;

  if (making) {
    return (
      <div className="sheet-setup" data-testid="sheet-setup">
        <NewCharacterPanel
          forJoined
          initialName={pcName ?? ''}
          initialStart={making}
          onCreated={(made) => {
            void linkCharacter(made.id).then(() => openSheet(true));
          }}
          // The builder and the PDF import open on the Sheets tab; what they make is linked here.
          onGuided={() => openSheet(false)}
          onClose={() => setMaking(null)}
        />
      </div>
    );
  }

  const title = pcName ? `Your sheet for ${pcName}` : 'Bringing a new character?';
  return (
    <section className="card sheet-setup" data-testid="sheet-setup" aria-label={title}>
      <h3>{title}</h3>
      <p className="muted small">
        {pcName
          ? 'Your GM’s card holds only the numbers the table needs. Link your character sheet to read it and roll from it here; your GM gets its numbers to accept, and can read it.'
          : 'Link a character from your Library, or make one, then ask your GM to add it to the party.'}
      </p>
      <div className="row sheet-setup-choices">
        {match && (
          <button
            type="button"
            className="btn primary"
            onClick={() => void linkCharacter(match.id)}
          >
            Use {match.name}
          </button>
        )}
        {loaded && characters.length > 0 && (
          <select
            aria-label="Use a character from your Library"
            value=""
            onChange={(e) => {
              if (e.target.value) void linkCharacter(e.target.value);
            }}
          >
            <option value="">{match ? 'Another from your Library…' : 'From your Library…'}</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className={`btn${match ? '' : ' primary'}`}
          onClick={() => setMaking('guided')}
        >
          Build one
        </button>
        <button type="button" className="btn" onClick={() => setMaking('pdf')}>
          Import from PDF
        </button>
        {onNotNow && (
          <button type="button" className="btn" onClick={onNotNow}>
            Not now
          </button>
        )}
      </div>
    </section>
  );
}
