import { useEffect, useState } from 'react';
import {
  readBackground,
  readClass,
  readSpecies,
  type BackgroundOption,
  type ClassOption,
  type SpeciesOption,
} from '@trifold/rules';
import type { CompendiumRecord, FeatRecord, RecordKind, SheetRef } from '@trifold/schema';

/**
 * What the guided builder offers (docs/BUILDER.md): the bundled SRD 5.2.1's classes,
 * backgrounds and species, read through `@trifold/rules`, and its feats for the background's
 * feat text. Loaded once per builder through the compendium API; a record the rules layer
 * cannot read is left out.
 */

const SRD_2024 = 'srd-2024';

export interface Offered<T> {
  option: T;
  ref: SheetRef;
}

export interface BuilderOptions {
  classes: Array<Offered<ClassOption>>;
  backgrounds: Array<Offered<BackgroundOption>>;
  species: Array<Offered<SpeciesOption>>;
  feats: FeatRecord[];
}

async function recordsOf(kind: RecordKind): Promise<CompendiumRecord[]> {
  const found = await window.trifold.compendium.search({
    kind,
    sourceIds: [SRD_2024],
    edition: '2024',
    limit: 500,
  });
  const records = await Promise.all(found.rows.map((r) => window.trifold.compendium.get(r.id)));
  return records.filter((r): r is CompendiumRecord => !!r && r.sourceId === SRD_2024);
}

const refOf = (r: CompendiumRecord): SheetRef => ({
  kind: r.kind,
  key: r.key,
  name: r.displayName,
});

export async function loadBuilderOptions(): Promise<BuilderOptions> {
  const [classes, backgrounds, species, feats] = await Promise.all([
    recordsOf('class'),
    recordsOf('background'),
    recordsOf('species'),
    recordsOf('feat'),
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
    backgrounds: backgrounds
      .flatMap((r) => {
        const option = r.kind === 'background' ? readBackground(r) : null;
        return option ? [{ option, ref: refOf(r) }] : [];
      })
      .sort(byName),
    species: species
      .flatMap((r) => (r.kind === 'species' ? [{ option: readSpecies(r), ref: refOf(r) }] : []))
      .sort(byName),
    feats: feats.filter((r): r is FeatRecord => r.kind === 'feat'),
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
