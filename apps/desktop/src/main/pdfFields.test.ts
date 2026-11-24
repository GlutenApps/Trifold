import { describe, expect, it } from 'vitest';
import { readPdfSheet } from '@trifold/importers';
import { fieldPdf, type FieldSpec } from '../../smoke/fieldPdf';
import { readPdfFields } from './pdfFields';

/** Import from PDF (ADR 0073): fields read from a PDF's pages with pdf.js. */

const fields: FieldSpec[] = [
  { name: 'CharacterName', value: 'Tamsin Reed', rect: [48, 710, 221, 731] },
  { name: 'ClassLevel', value: 'Fighter 3', rect: [270, 728, 376, 744] },
  { name: 'STR', value: '+3', rect: [37, 612, 78, 638] },
  { name: 'STRmod', value: '16', rect: [46, 592, 68, 605] },
  { name: 'ST Strength', value: '+5', rect: [113, 577, 127, 585] },
  { name: 'Check Box 11', value: true, rect: [101, 577, 107, 585] },
  { name: 'Check Box 18', value: false, rect: [101, 563, 107, 571] },
  { name: 'HPMax', value: '28', rect: [291, 585, 380, 595] },
  { name: 'Spells 1014', value: 'Fire Bolt (Magic Initiate)', rect: [40, 607, 199, 620], page: 3 },
];

describe('readPdfFields', () => {
  it('reads text fields and check boxes, with their pages and rectangles', async () => {
    const read = await readPdfFields(fieldPdf(fields));
    expect(read.map((f) => [f.page, f.name, f.kind, f.value, f.checked])).toEqual([
      [1, 'CharacterName', 'text', 'Tamsin Reed', false],
      [1, 'ClassLevel', 'text', 'Fighter 3', false],
      [1, 'STR', 'text', '+3', false],
      [1, 'STRmod', 'text', '16', false],
      [1, 'ST Strength', 'text', '+5', false],
      [1, 'Check Box 11', 'check', '', true],
      [1, 'Check Box 18', 'check', '', false],
      [1, 'HPMax', 'text', '28', false],
      [3, 'Spells 1014', 'text', 'Fire Bolt (Magic Initiate)', false],
    ]);
    expect(read[0]!.rect).toEqual([48, 710, 221, 731]);
  });

  it('reads the widgets of a PDF that has no form dictionary, as the app export does', async () => {
    const read = await readPdfFields(fieldPdf(fields, { withForm: false }));
    expect(read).toHaveLength(fields.length);
    const result = readPdfSheet(read);
    expect(result.ok && result.imported.sheet.abilities.str).toBe(16);
    expect(result.ok && result.imported.sheet.saves).toEqual(['str']);
  });

  it('reads no fields from a PDF without any', async () => {
    expect(await readPdfFields(fieldPdf([]))).toEqual([]);
  });

  it('throws on something that is not a PDF', async () => {
    await expect(readPdfFields(new TextEncoder().encode('not a pdf'))).rejects.toThrow();
  });
});
