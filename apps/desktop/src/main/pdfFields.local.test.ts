import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { linkSheetRecords, readPdfSheet } from '@trifold/importers';
import { deriveSheet } from '@trifold/rules';
import { readPdfFields } from './pdfFields';

/**
 * Import from PDF against real exported sheets (ADR 0073), which stay out of the repo: put them
 * in fixtures/local/pdf-sheets/ (git-ignored). Skipped when the folder is not there, as in CI.
 * A `<name>.expected.json` beside a PDF, as the sheet corpus has, is checked too.
 */

const ROOT = join(__dirname, '../../../../fixtures/local/pdf-sheets');

/** The bundled SRD's records by kind and key, to link against as main does with the index. */
const SRD = new Map<string, string>();
for (const file of ['srd-2024.jsonl', 'srd-2014.jsonl']) {
  const path = join(__dirname, '../../../../resources', file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as { kind: string; key: string; displayName: string };
    if (!SRD.has(`${r.kind}:${r.key}`)) SRD.set(`${r.kind}:${r.key}`, r.displayName);
  }
}
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
    const links = linkSheetRecords(imported.sheet, (kind, key) => {
      const name = SRD.get(`${kind}:${key}`);
      return name ? { key, name } : null;
    });
    const l = links.sheet;
    console.log(
      `  linked to the SRD: ${links.linked} · spells ${l.spells.filter((x) => x.ref).length}/${l.spells.length} · items ${l.equipment.filter((x) => x.ref).length}/${l.equipment.length} · feats ${l.features
        .filter((x) => x.ref)
        .map((x) => x.name)
        .join(
          ', ',
        )} · ${l.speciesRef ? 'species' : ''} ${l.backgroundRef ? 'background' : ''} ${l.classes.filter((c) => c.ref).length} classes`,
    );
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
        expected_values?: { CharacterName?: string; scores?: Record<string, number> };
        values?: Record<string, string | boolean>;
      };
      const want = expected.expected_values;
      if (want?.CharacterName) expect(imported.name).toBe(want.CharacterName);
      if (want?.scores) expect(s.abilities).toEqual(want.scores);
      // The 2024 sheet's expected values are keyed by meaning ("abilities.str.score").
      const v = expected.values;
      if (v) {
        expect(imported.name).toBe(v['characterName']);
        for (const a of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) {
          expect(s.abilities[a]).toBe(Number(v[`abilities.${a}.score`]));
          expect(s.saves.includes(a)).toBe(v[`abilities.${a}.saveProf`] === true);
          expect(n.saves[a].value).toBe(Number(String(v[`abilities.${a}.save`]).replace('+', '')));
        }
        for (const [key, value] of Object.entries(v)) {
          const skill = /^skills\.(\w+)\.total$/.exec(key)?.[1] as
            keyof typeof n.skills | undefined;
          if (!skill) continue;
          expect(n.skills[skill].value).toBe(Number(String(value).replace('+', '')));
          expect(!!s.skills[skill]).toBe(v[`skills.${skill}.prof`] === true);
        }
        expect(s.maxHp).toBe(Number(v['hpMax']));
        expect(n.ac.value).toBe(Number(v['armorClass']));
      }
    }
  });
});
