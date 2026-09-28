export * from './types';
export * from './normalize';

/** Shape of `resources/srd-manifest.json`, written by `scripts/fetch-open5e.ts`. */
export interface SrdManifestDocument {
  /** Open5e document key, also the Trifold source id (`srd-2024`, `srd-2014`). */
  key: string;
  name: string;
  displayName: string;
  edition: '2024' | '2014';
  publisher: string;
  permalink: string;
  licenses: Array<{ key: string; name: string }>;
  /** Composed from the document metadata above; shown on the About page. */
  attribution: string;
  file: string;
  sha256: string;
  counts: Record<string, number>;
  warnings: string[];
}

export interface SrdManifest {
  schemaVersion: 1;
  fetchedAt: string;
  apiBase: string;
  importerVersion: number;
  documents: SrdManifestDocument[];
  licenses: Record<string, { name: string; text: string }>;
}
