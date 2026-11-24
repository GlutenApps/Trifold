import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPdfSheet } from '@trifold/importers';
import { deriveSheet } from '@trifold/rules';
import { readPdfFields } from './pdfFields';

/**
 * Import from PDF against real exported sheets (ADR 0073), which stay out of the repo: put them
 * in fixtures/local/pdf-sheets/ (git-ignored). Skipped when the folder is not there, as in CI.
 * A `<name>.expected.json` beside a PDF, as the sheet corpus has, is checked too.
 */

const ROOT = join(__dirname, '../../../../fixtures/local/pdf-sheets');
const pdfs = existsSync(ROOT)
  ? readdirSync(ROOT, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.pdf'))
  : [];

describe.skipIf(pdfs.length === 0)('Import from PDF, local sheets', () => {
  it.each(pdfs)('%s', async (file) => {
    const fields = await readPdfFields(new Uint8Array(readFileSync(join(ROOT, file))));
    const result = readPdfSheet(fields);
    if (!result.ok) {
      console.log(`${file}: ${result.problem} (${fields.length} fields)`);
      return;
    }
    const { imported, warnings } = result;
    const s = imported.sheet;
    const n = deriveSheet(s);
    console.log(
      [
        `${file}: ${imported.layout}, ${imported.edition}, "${imported.name}"`,
        `  ${s.classes.map((c) => `${c.name}${c.subclass ? ` (${c.subclass})` : ''} ${c.level}`).join(' / ')} · ${s.species} · ${s.background}`,
        `  ${Object.entries(s.abilities)
          .map(([a, v]) => `${a} ${v}`)
          .join(
            ' ',
          )} · HP ${s.maxHp} · AC ${n.ac.value} · init ${n.initiative.value} · speed ${s.speed} · PB ${n.proficiencyBonus.value}`,
        `  saves ${s.saves.join(',')} · skills ${Object.entries(s.skills)
          .map(([k, v]) => `${k}${v === 'expertise' ? '*' : ''}`)
          .join(',')}`,
        `  overrides ${JSON.stringify(s.overrides)}`,
        `  ${s.attacks.length} attacks, ${s.features.length} features, ${s.spells.length} spells (slots ${s.slots.join('/')}), ${s.equipment.length} items, ${s.gp} gp, notes ${imported.notes.length} chars`,
        `  spells by level ${JSON.stringify(s.spells.reduce<Record<number, string[]>>((m, x) => ({ ...m, [x.level]: [...(m[x.level] ?? []), `${x.name}${x.prepared ? '+' : ''}`] }), {}))}`.slice(
          0,
          900,
        ),
        `  features ${s.features.map((f) => `${f.name} [${f.from}] ${f.text.length}`).join('; ')}`.slice(
          0,
          900,
        ),
        `  items ${s.equipment.map((i) => `${i.quantity}x ${i.name}`).join('; ')}`.slice(0, 400),
        `  attacks ${s.attacks.map((a) => `${a.name} ${a.bonus} ${a.damage}`).join('; ')}`,
        ...warnings.map((w) => `  ! ${w}`),
      ].join('\n'),
    );
    const expectedFile = join(ROOT, file.replace(/\.pdf$/, '.expected.json'));
    if (existsSync(expectedFile)) {
      const expected = JSON.parse(readFileSync(expectedFile, 'utf8')) as {
        expected_values: { CharacterName?: string; scores?: Record<string, number> };
      };
      const want = expected.expected_values;
      if (want.CharacterName) expect(imported.name).toBe(want.CharacterName);
      if (want.scores) expect(s.abilities).toEqual(want.scores);
    }
  });
});
