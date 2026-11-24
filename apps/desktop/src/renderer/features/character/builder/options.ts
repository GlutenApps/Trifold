import { useEffect, useState } from 'react';
import {
  readBackground,
  readClass,
  readLegacyBackground,
  readLegacySpecies,
  readSpecies,
  readSubclass,
  type SubclassOption,
  type BackgroundOption,
  type ClassOption,
  type SpeciesOption,
} from '@trifold/rules';
import type {
  CompendiumRecord,
  FeatRecord,
  ItemRecord,
  RecordKind,
  SheetRef,
  SpellRecord,
} from '@trifold/schema';

/**
 * What the guided builder offers (docs/BUILDER.md): the bundled SRD 5.2.1's classes,
 * backgrounds and species, read through `@trifold/rules`, and its feats for the background's
 * feat text. Loaded once per builder through the compendium API; a record the rules layer
 * cannot read is left out.
 */

const SRD_2024 = 'srd-2024';
const SRD_2014 = 'srd-2014';

export interface Offered<T> {
  option: T;
  ref: SheetRef;
}

export interface BuilderOptions {
  classes: Array<Offered<ClassOption>>;
  /** Subclasses, each naming its class (Level up). */
  subclasses: Array<Offered<SubclassOption>>;
  backgrounds: Array<Offered<BackgroundOption>>;
  species: Array<Offered<SpeciesOption>>;
  /** SRD 5.1 backgrounds and species, used the 2024 way (Legacy options). */
  legacyBackgrounds: Array<Offered<BackgroundOption>>;
  legacySpecies: Array<Offered<SpeciesOption>>;
  feats: FeatRecord[];
  /** The SRD's items by lowercased name, for starting equipment. */
  items: Map<string, ItemRecord>;
  /** The SRD's spells, each with the classes whose lists hold it. */
  spells: SpellRecord[];
}

async function recordsOf(kind: RecordKind, source = SRD_2024): Promise<CompendiumRecord[]> {
  const found = await window.trifold.compendium.search({
    kind,
    sourceIds: [source],
    edition: source === SRD_2024 ? '2024' : '2014',
    limit: 500,
  });
  const records = await Promise.all(found.rows.map((r) => window.trifold.compendium.get(r.id)));
  return records.filter((r): r is CompendiumRecord => !!r && r.sourceId === source);
}

const refOf = (r: CompendiumRecord): SheetRef => ({
  kind: r.kind,
  key: r.key,
  name: r.displayName,
});

export async function loadBuilderOptions(): Promise<BuilderOptions> {
  const [classes, backgrounds, species, feats, items, spells, oldBackgrounds, oldSpecies] =
    await Promise.all([
      recordsOf('class'),
      recordsOf('background'),
      recordsOf('species'),
      recordsOf('feat'),
      recordsOf('item'),
      recordsOf('spell'),
      recordsOf('background', SRD_2014),
      recordsOf('species', SRD_2014),
    ]);
  const byName = <T extends { option: { name: string } }>(a: T, b: T) =>
    a.option.name.localeCompare(b.option.name);
  return {
    classes: classes
      .flatMap((r) => {
        const option = r.kind === 'class' ? readClass(r) : null;
        return option ? [{ option, ref: refOf(r) }] : [];
      })
      .sort(byName),
    subclasses: classes
      .flatMap((r) => {
        const option = r.kind === 'class' ? readSubclass(r) : null;
        return option ? [{ option, ref: refOf(r) }] : [];
      })
      .sort(byName),
    backgrounds: backgrounds
      .flatMap((r) => {
        const option = r.kind === 'background' ? readBackground(r) : null;
        return option ? [{ option, ref: refOf(r) }] : [];
      })
      .sort(byName),
    species: species
      .flatMap((r) => (r.kind === 'species' ? [{ option: readSpecies(r), ref: refOf(r) }] : []))
      .sort(byName),
    legacyBackgrounds: oldBackgrounds
      .flatMap((r) =>
        r.kind === 'background' ? [{ option: readLegacyBackground(r), ref: refOf(r) }] : [],
      )
      .sort(byName),
    legacySpecies: oldSpecies
      .flatMap((r) => {
        const option = r.kind === 'species' ? readLegacySpecies(r) : null;
        return option ? [{ option, ref: refOf(r) }] : [];
      })
      .sort(byName),
    feats: feats.filter((r): r is FeatRecord => r.kind === 'feat'),
    spells: spells
      .filter((r): r is SpellRecord => r.kind === 'spell')
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    items: new Map(
      items
        .filter((r): r is ItemRecord => r.kind === 'item')
        .map((r) => [r.displayName.toLowerCase(), r]),
    ),
  };
}

/** The builder's options, loaded once; null while loading, with an error if it failed. */
export function useBuilderOptions(): { options: BuilderOptions | null; error: string | null } {
  const [options, setOptions] = useState<BuilderOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadBuilderOptions()
      .then((o) => live && setOptions(o))
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, []);
  return { options, error };
}
