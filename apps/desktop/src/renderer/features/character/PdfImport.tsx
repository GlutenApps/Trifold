import { useState } from 'react';
import type { PdfSheetPreview } from '@trifold/api';
import { errorMessage, type Character, type CharacterEdition } from '@trifold/schema';
import { SheetView } from './SheetView';

/**
 * Import from PDF (ADR 0073; docs/PLAYER-MODE.md, Way 2): a character sheet PDF another app
 * exported, read on this computer into a sheet to look over. Nothing is written until Create
 * character (a new one) or Replace sheet (Update from PDF on a Trifold character).
 */
export function PdfImport({
  name,
  mode = 'create',
  onDone,
  onCancel,
}: {
  /** The name typed for a new character; empty takes the sheet's. */
  name: string;
  mode?: 'create' | 'replace';
  onDone(preview: PdfSheetPreview, name: string, edition: CharacterEdition): void;
  onCancel(): void;
}) {
  const [preview, setPreview] = useState<PdfSheetPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chosenName, setChosenName] = useState(name);
  const [edition, setEdition] = useState<CharacterEdition>('2024');

  const choose = async () => {
    setBusy(true);
    setError(null);
    try {
      const read = await window.trifold.characters.readPdf();
      if (read) {
        setPreview(read);
        setEdition(read.edition);
        if (!name.trim()) setChosenName(read.name);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const finalName = chosenName.trim() || preview?.name || 'Unnamed character';
  const overridden = preview ? Object.keys(preview.sheet.overrides).length : 0;
  const shown: Character | null = preview
    ? {
        schemaVersion: 1,
        id: 'preview',
        name: finalName,
        kind: 'trifold',
        edition,
        numbers: {
          classText: '',
          level: 1,
          maxHp: 10,
          ac: 10,
          initiativeBonus: 0,
          speed: 30,
          passives: { perception: 10, insight: 10, investigation: 10 },
          saves: {},
        },
        sheet: preview.sheet,
        notes: preview.notes,
        createdAt: '1970-01-01T00:00:00.000Z',
        updatedAt: '1970-01-01T00:00:00.000Z',
      }
    : null;

  return (
    <section
      className="guided-builder pdf-import"
      aria-label="Import from PDF"
      data-testid="pdf-import"
    >
      <div className="books-panel-head">
        <strong>{mode === 'create' ? 'Import from PDF' : 'Update from PDF'}</strong>
      </div>
      {!preview && (
        <p className="muted small">
          Pick a character sheet PDF exported from another app. Trifold reads its fields on this
          computer and shows you the sheet; nothing is saved until you{' '}
          {mode === 'create' ? 'create the character' : 'replace the sheet'}.
        </p>
      )}
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
        </div>
      )}
      <div className="row">
        <button type="button" className="btn" disabled={busy} onClick={() => void choose()}>
          {busy ? 'Reading…' : preview ? 'Choose another PDF…' : 'Choose PDF…'}
        </button>
        {preview && <span className="muted small">{preview.fileName}</span>}
      </div>

      {preview && shown && (
        <>
          <div className="row">
            {mode === 'create' && (
              <label className="field grow">
                Name
                <input
                  type="text"
                  aria-label="Name"
                  maxLength={80}
                  value={chosenName}
                  placeholder={preview.name || 'Name'}
                  onChange={(e) => setChosenName(e.target.value)}
                />
              </label>
            )}
            <label className="field">
              Rules
              <select
                aria-label="Rules"
                value={edition}
                onChange={(e) => setEdition(e.target.value as CharacterEdition)}
              >
                <option value="2024">2024 rules</option>
                <option value="2014">Legacy rules</option>
              </select>
            </label>
          </div>
          {preview.warnings.length > 0 && (
            <div className="banner warn" role="status" data-testid="pdf-warnings">
              <ul>
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="muted small">
            {preview.sheet.features.length} features, {preview.sheet.spells.length} spells,{' '}
            {preview.sheet.equipment.length} items
            {overridden > 0 &&
              `; ${overridden} number${overridden === 1 ? '' : 's'} kept as the PDF gives ${overridden === 1 ? 'it' : 'them'}, marked as overridden`}
            .{mode === 'replace' && ' Replacing the sheet loses changes made to it here.'}
          </p>
          <div className="row">
            <button
              type="button"
              className="btn primary"
              onClick={() => onDone(preview, finalName, edition)}
            >
              {mode === 'create' ? 'Create character' : 'Replace sheet'}
            </button>
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
          <SheetView character={shown} />
        </>
      )}
      {!preview && (
        <div className="row">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
