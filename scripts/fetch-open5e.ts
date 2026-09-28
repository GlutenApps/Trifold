// Build-time only (DESIGN.md §6.1, DATA-FORMATS.md §4). Pulls the two SRD documents from the
// Open5e v2 API, normalizes them into Trifold records and writes:
//   resources/srd-2024.jsonl, resources/srd-2014.jsonl   (git-ignored, packaged with the app)
//   resources/srd-manifest.json                          (committed: keys, counts, licenses)
// Never runs inside the app. Usage: pnpm fetch:open5e [--api https://api.open5e.com/v2]
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IMPORTER_VERSION,
  normalizeOpen5e,
  O5E_KINDS,
  type O5eBase,
  type O5eKind,
  type SrdManifest,
  type SrdManifestDocument,
} from '@trifold/importers';
import { CompendiumRecord, type Edition } from '@trifold/schema';

const API = process.argv.includes('--api')
  ? (process.argv[process.argv.indexOf('--api') + 1] ?? 'https://api.open5e.com/v2')
  : 'https://api.open5e.com/v2';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources');
const DOCUMENTS: Array<{ key: string; edition: Edition & ('2024' | '2014') }> = [
  { key: 'srd-2024', edition: '2024' },
  { key: 'srd-2014', edition: '2014' },
];

interface Page<T> {
  count: number;
  next: string | null;
  results: T[];
}

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (res.ok) return (await res.json()) as T;
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`${res.status} ${res.statusText} for ${url}`);
    }
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

async function* paginate<T>(path: string): AsyncGenerator<T> {
  let url: string | null = `${API}/${path}`;
  while (url) {
    const page: Page<T> = await getJson<Page<T>>(url);
    for (const r of page.results) yield r;
    url = page.next ? page.next.replace(/^http:\/\//, 'https://') : null;
  }
}

interface ApiDocument {
  key: string;
  name: string;
  display_name?: string;
  publisher?: { name?: string; key?: string };
  permalink?: string;
  licenses?: Array<{ key: string; name: string }>;
}

interface ApiLicense {
  key: string;
  name: string;
  desc?: string;
}

function attributionFor(doc: ApiDocument): string {
  const publisher = doc.publisher?.name ?? 'the publisher';
  const licenses = (doc.licenses ?? []).map((l) => l.name).join(' and ');
  const link = doc.permalink ? `, available at ${doc.permalink}` : '';
  return `This work includes material taken from the ${doc.name} by ${publisher}${link}. It is licensed under the ${licenses}.`;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  console.log(`fetching from ${API}`);

  const licenses: SrdManifest['licenses'] = {};
  for await (const l of paginate<ApiLicense>('licenses/?limit=50')) {
    licenses[l.key] = { name: l.name, text: (l.desc ?? '').trim() };
  }

  const documents: SrdManifestDocument[] = [];
  for (const { key, edition } of DOCUMENTS) {
    const doc = await getJson<ApiDocument>(`${API}/documents/${key}/`);
    const warnings: string[] = [];
    const ctx = {
      sourceId: key,
      edition,
      sourceBook: doc.name,
      warn: (m: string) => warnings.push(m),
    };
    const lines: string[] = [];
    const counts: Record<string, number> = {};
    let foreign = 0;
    for (const kind of O5E_KINDS as O5eKind[]) {
      let n = 0;
      for await (const raw of paginate<O5eBase>(`${kind}/?document__key=${key}&limit=200`)) {
        // Some endpoints ignore the document filter; keep only records that belong to this document.
        if (raw.document?.key && raw.document.key !== key) {
          foreign += 1;
          continue;
        }
        const record = normalizeOpen5e(kind, raw, ctx);
        const parsed = CompendiumRecord.safeParse(record);
        if (!parsed.success) {
          warnings.push(
            `${kind} ${raw.key}: invalid (${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message})`,
          );
          continue;
        }
        lines.push(JSON.stringify(parsed.data));
        counts[parsed.data.kind] = (counts[parsed.data.kind] ?? 0) + 1;
        n += 1;
      }
      console.log(`  ${key} ${kind}: ${n}`);
    }
    const file = `${key}.jsonl`;
    const content = `${lines.join('\n')}\n`;
    writeFileSync(join(OUT, file), content, 'utf8');
    documents.push({
      key,
      name: doc.name,
      displayName: doc.display_name ?? doc.name,
      edition,
      publisher: doc.publisher?.name ?? '',
      permalink: doc.permalink ?? '',
      licenses: (doc.licenses ?? []).map((l) => ({ key: l.key, name: l.name })),
      attribution: attributionFor(doc),
      file,
      sha256: createHash('sha256').update(content).digest('hex'),
      counts,
      warnings,
    });
    if (foreign) console.log(`  ${key}: skipped ${foreign} records that belong to other documents`);
    if (warnings.length) console.log(`  ${key}: ${warnings.length} warnings`);
  }

  const manifest: SrdManifest = {
    schemaVersion: 1,
    fetchedAt: new Date().toISOString(),
    apiBase: API,
    importerVersion: IMPORTER_VERSION,
    documents,
    licenses: Object.fromEntries(
      Object.entries(licenses).filter(([k]) =>
        documents.some((d) => d.licenses.some((l) => l.key === k)),
      ),
    ),
  };
  writeFileSync(join(OUT, 'srd-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(
    `wrote ${documents.map((d) => `${d.file} (${Object.values(d.counts).reduce((a, b) => a + b, 0)})`).join(', ')} and srd-manifest.json`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
