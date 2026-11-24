import { useEffect, useState } from 'react';
import { tableNumbers } from '@trifold/rules';
import type { Character } from '@trifold/schema';
import { useCharacterStore } from '../../stores/characterStore';
import { Icon } from '../shell/icons';
import { CharacterEditor } from './CharacterEditor';
import { GuidedBuilder } from './builder/GuidedBuilder';
import { PdfImport } from './PdfImport';

/**
 * Library › Characters (docs/PLAYER-MODE.md, Part 3; ADR 0068): the player's characters, shared
 * by every campaign they join. New character makes an External character (the sheet kept in
 * another app, the table's numbers entered here) or a Trifold character (the sheet here, its
 * numbers worked out). A character opens in its editor on this page.
 */

/** "Fighter 5 · AC 18 · 44 HP", or what is missing. */
export function characterLine(character: Character): string {
  const n = tableNumbers(character);
  const cls = n.classText || `Level ${n.level}`;
  return `${cls} · AC ${n.ac} · ${n.maxHp} HP`;
}

export function NewCharacterPanel({
  onCreated,
  onGuided,
  onClose,
  forJoined = false,
}: {
  onCreated?(character: Character): void;
  /** The guided builder was chosen and opened (docs/BUILDER.md). */
  onGuided?(): void;
  onClose(): void;
  /** Made from a joined campaign: the builder's result is linked to it. */
  forJoined?: boolean;
}) {
  const create = useCharacterStore((s) => s.create);
  const startBuilding = useCharacterStore((s) => s.startBuilding);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Character['kind']>('trifold');
  /** How a Trifold character starts (docs/BUILDER.md): guided builder, blank sheet or a PDF. */
  const [start, setStart] = useState<'guided' | 'blank' | 'pdf'>('guided');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card campaign-create"
      data-testid="new-character"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (kind === 'trifold' && start === 'pdf') {
          // Import from PDF (ADR 0073): an empty name takes the sheet's.
          startBuilding(name.trim(), forJoined, 'pdf');
          onGuided?.();
          onClose();
          return;
        }
        if (kind === 'trifold' && start === 'guided') {
          startBuilding(name.trim() || 'Unnamed character', forJoined);
          onGuided?.();
          onClose();
          return;
        }
        setBusy(true);
        void create(kind, name).then((made) => {
          setBusy(false);
          if (made) {
            onCreated?.(made);
            onClose();
          }
        });
      }}
    >
      <div className="campaign-create-way new-character-way">
        <strong>New character</strong>
        <input
          type="text"
          aria-label="Character name"
          placeholder="Name"
          className="wide-input"
          maxLength={80}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <fieldset className="character-kinds">
          <legend className="sr-only">Kind of character</legend>
          <label className="character-kind">
            <input
              type="radio"
              name="character-kind"
              checked={kind === 'external'}
              onChange={() => setKind('external')}
            />
            <span>
              <strong>External character</strong>
              <span className="muted small">
                Your sheet lives in another app. Enter the numbers the table needs, and a link to
                your sheet.
              </span>
            </span>
          </label>
          <label className="character-kind">
            <input
              type="radio"
              name="character-kind"
              checked={kind === 'trifold'}
              onChange={() => setKind('trifold')}
            />
            <span>
              <strong>Trifold character</strong>
              <span className="muted small">
                Your sheet lives here: abilities, skills, attacks, spells and gear. Trifold works
                out the numbers.
              </span>
            </span>
          </label>
        </fieldset>
        {kind === 'trifold' && (
          <fieldset className="character-kinds character-starts">
            <legend className="small">Start with</legend>
            <label className="character-kind">
              <input
                type="radio"
                name="character-start"
                checked={start === 'guided'}
                onChange={() => setStart('guided')}
              />
              <span>
                <strong>Guided builder</strong>
                <span className="muted small">
                  Choose a class, background, species and ability scores; Trifold fills the sheet
                  in.
                </span>
              </span>
            </label>
            <label className="character-kind">
              <input
                type="radio"
                name="character-start"
                checked={start === 'blank'}
                onChange={() => setStart('blank')}
              />
              <span>
                <strong>Blank sheet</strong>
                <span className="muted small">Fill the sheet in yourself.</span>
              </span>
            </label>
            <label className="character-kind">
              <input
                type="radio"
                name="character-start"
                checked={start === 'pdf'}
                onChange={() => setStart('pdf')}
              />
              <span>
                <strong>Import from PDF</strong>
                <span className="muted small">
                  Read a character sheet PDF another app exported, then check it over.
                </span>
              </span>
            </label>
          </fieldset>
        )}
        <div className="row">
          <button type="submit" className="btn primary" disabled={busy}>
            {kind === 'trifold' && start !== 'blank' ? 'Start' : 'Create'}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

export function CharactersPage() {
  const characters = useCharacterStore((s) => s.characters);
  const loaded = useCharacterStore((s) => s.loaded);
  const openId = useCharacterStore((s) => s.openId);
  const error = useCharacterStore((s) => s.error);
  const load = useCharacterStore((s) => s.load);
  const open = useCharacterStore((s) => s.open);
  const importFile = useCharacterStore((s) => s.importFile);
  const clearError = useCharacterStore((s) => s.clearError);
  const building = useCharacterStore((s) => s.building);
  const cancelBuilding = useCharacterStore((s) => s.cancelBuilding);
  const createBuilt = useCharacterStore((s) => s.createBuilt);
  const createImported = useCharacterStore((s) => s.createImported);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const current = characters.find((c) => c.id === openId) ?? null;
  if (building && !building.forJoined && building.way === 'pdf') {
    return (
      <PdfImport
        name={building.name}
        onCancel={cancelBuilding}
        onDone={(preview, name, edition) =>
          void createImported(name, preview, edition).then((made) => made && open(made.id))
        }
      />
    );
  }
  if (building && !building.forJoined) {
    return (
      <GuidedBuilder
        name={building.name}
        onCancel={cancelBuilding}
        onFinish={(sheet, build) =>
          void createBuilt(building.name, sheet, build).then((made) => made && open(made.id))
        }
      />
    );
  }
  if (current) return <CharacterEditor character={current} onBack={() => open(null)} />;

  return (
    <section className="characters-page" data-testid="characters-page">
      <div className="row">
        <h1>Characters</h1>
        <span className="spacer" />
        <button
          type="button"
          className={`btn primary${adding ? ' on' : ''}`}
          aria-expanded={adding}
          onClick={() => setAdding((v) => !v)}
        >
          <Icon name="plus" />
          New character
        </button>
        <button type="button" className="btn" onClick={() => void importFile()}>
          Import character…
        </button>
      </div>
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn small" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}
      <p className="muted">
        Your characters, for every campaign you join. A character is yours: the GM gets only the
        numbers the table needs, and only when you offer them.
      </p>
      {adding && <NewCharacterPanel onClose={() => setAdding(false)} />}
      {loaded && characters.length === 0 && !adding && (
        <p className="muted">No characters yet. Press New character to make one.</p>
      )}
      <ul className="character-list" aria-label="Characters">
        {characters.map((c) => (
          <li key={c.id} className="character-row" data-testid="character-row">
            <button
              type="button"
              className="character-open"
              aria-label={`Open ${c.name}`}
              onClick={() => open(c.id)}
            >
              <Icon name="person" size={15} />
              <span className="grow">
                <strong>{c.name}</strong>
                <span className="muted small"> · {characterLine(c)}</span>
              </span>
              <span className="badge">{c.kind === 'external' ? 'External' : 'Trifold'}</span>
              <span className="badge">{c.edition === '2014' ? 'Legacy' : '2024'}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
