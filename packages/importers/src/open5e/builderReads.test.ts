import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  BackgroundRecord,
  ClassRecord,
  CompendiumRecord,
  SpeciesRecord,
} from '@trifold/schema';
import {
  readBackground,
  readClass,
  readLegacyBackground,
  readLegacySpecies,
  readSpecies,
} from '@trifold/rules';

/**
 * The builder's readers against the bundled SRD 5.2.1 snapshot itself (docs/BUILDER.md), when it
 * has been fetched (`pnpm fetch:content`): every class, background and species reads.
 */
const SNAPSHOT = join(__dirname, '..', '..', '..', '..', 'resources', 'srd-2024.jsonl');
const records: CompendiumRecord[] = existsSync(SNAPSHOT)
  ? readFileSync(SNAPSHOT, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as CompendiumRecord)
  : [];

describe.skipIf(records.length === 0)('the builder reads the bundled SRD 5.2.1', () => {
  it('reads all 12 classes, with skills, equipment and a subclass level', () => {
    const classes = records.filter(
      (r): r is ClassRecord => r.kind === 'class' && !r.data.extra['subclassOf'],
    );
    expect(classes).toHaveLength(12);
    for (const c of classes) {
      const option = readClass(c);
      expect(option, c.displayName).not.toBeNull();
      expect(option!.saves, c.displayName).toHaveLength(2);
      expect(option!.skills.choose, c.displayName).toBeGreaterThan(0);
      expect(option!.equipment.length, c.displayName).toBeGreaterThanOrEqual(2);
      expect(option!.subclassLevel, c.displayName).toBe(3);
    }
  });

  it('reads every background and species', () => {
    const backgrounds = records.filter((r): r is BackgroundRecord => r.kind === 'background');
    expect(backgrounds.length).toBeGreaterThan(0);
    for (const b of backgrounds) expect(readBackground(b), b.displayName).not.toBeNull();
    const species = records.filter((r): r is SpeciesRecord => r.kind === 'species');
    expect(species.length).toBeGreaterThan(0);
    for (const s of species) expect(readSpecies(s).speed, s.displayName).toBeGreaterThanOrEqual(25);
  });
});

const LEGACY = join(__dirname, '..', '..', '..', '..', 'resources', 'srd-2014.jsonl');
const legacy: CompendiumRecord[] = existsSync(LEGACY)
  ? readFileSync(LEGACY, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as CompendiumRecord)
  : [];

describe.skipIf(legacy.length === 0)(
  'the builder reads the bundled SRD 5.1 as legacy options',
  () => {
    it('reads every background, the base species with their speed, and leaves subraces out', () => {
      for (const b of legacy.filter((r): r is BackgroundRecord => r.kind === 'background')) {
        expect(readLegacyBackground(b).skills.length, b.displayName).toBeGreaterThan(0);
      }
      const species = legacy.filter((r): r is SpeciesRecord => r.kind === 'species');
      const read = species.flatMap((s) => {
        const option = readLegacySpecies(s);
        return option ? [option] : [];
      });
      expect(read.map((s) => s.name).sort()).toEqual([
        'Dragonborn',
        'Dwarf',
        'Elf',
        'Gnome',
        'Half-Elf',
        'Half-Orc',
        'Halfling',
        'Human',
        'Tiefling',
      ]);
      expect(read.find((s) => s.name === 'Dwarf')?.speed).toBe(25);
      expect(read.find((s) => s.name === 'Halfling')?.sizes).toEqual(['Small']);
    });
  },
);
