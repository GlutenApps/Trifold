// Build-time only. Turns samples/greyford/ into resources/sample/greyford.trifold-campaign, the
// sample campaign every Library is given once (ADR 0016). Needs the SRD snapshot that
// `pnpm fetch:content` writes (the sample's creatures are SRD records); the icon set is optional
// (tokens fall back to initials). The output is git-ignored and checked by check-content.mjs.
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import {
  CAMPAIGN_SCHEMA_VERSION,
  IconTables,
  LIBRARY_SCHEMA_VERSION,
  type CompendiumRecord,
} from '@trifold/schema';
import {
  buildSampleCampaign,
  jpegSize,
  SAMPLE_TIME,
} from '../packages/importers/src/sample/buildSample';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'greyford';
const sourceDir = join(root, 'samples', NAME);
const outDir = join(root, 'resources', 'sample');
const target = join(outDir, `${NAME}.trifold-campaign`);
/** The part of yazl this script uses. */
interface ZipFile {
  addBuffer(data: Buffer, path: string, options?: { mtime?: Date; compress?: boolean }): void;
  end(): void;
  outputStream: NodeJS.ReadableStream;
}
// yazl is a dependency of the desktop app; resolve it from there (pnpm keeps packages strict).
const yazl = createRequire(join(root, 'apps', 'desktop', 'package.json'))('yazl') as {
  ZipFile: new () => ZipFile;
};

const fail = (message: string): never => {
  console.error(`build-sample: ${message}`);
  process.exit(1);
};

const source = JSON.parse(readFileSync(join(sourceDir, 'campaign.json'), 'utf8')) as {
  npcs: { record?: string }[];
  encounters: { combatants: { record?: string }[] }[];
  scenes: { image?: string; backgrounds?: { image: string }[] }[];
};

// The SRD records the sample names.
const wanted = new Set<string>([
  ...source.npcs.flatMap((n) => (n.record ? [n.record] : [])),
  ...source.encounters.flatMap((e) => e.combatants.flatMap((c) => (c.record ? [c.record] : []))),
]);
const srdFile = join(root, 'resources', 'srd-2024.jsonl');
if (!existsSync(srdFile)) fail('resources/srd-2024.jsonl is missing; run `pnpm fetch:content`');
const records = new Map<string, CompendiumRecord>();
for (const line of readFileSync(srdFile, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const record = JSON.parse(line) as CompendiumRecord;
  if (wanted.has(record.id)) records.set(record.id, record);
}

// Token glyphs: the mapping tables are committed; the svg set is fetched.
const icons = IconTables.parse(
  JSON.parse(readFileSync(join(root, 'resources', 'icons', 'mapping.json'), 'utf8')),
);
const svgDir = join(root, 'resources', 'icons', 'svg');
const availableIcons = new Set(
  existsSync(svgDir)
    ? readdirSync(svgDir)
        .filter((f) => f.endsWith('.svg'))
        .map((f) => f.slice(0, -4))
    : [],
);
if (availableIcons.size === 0) console.warn('build-sample: no icon set; tokens will show initials');

const imageSizes = new Map<string, { width: number; height: number }>();
for (const path of source.scenes.flatMap((s) => [
  ...(s.image ? [s.image] : []),
  ...(s.backgrounds ?? []).map((b) => b.image),
])) {
  if (imageSizes.has(path)) continue;
  const size = jpegSize(readFileSync(join(sourceDir, path)));
  if (!size) fail(`${path} is not a JPEG`);
  imageSizes.set(path, size!);
}

const notes = readdirSync(join(sourceDir, 'notes'))
  .filter((f) => f.endsWith('.md'))
  .map((name) => ({ name, text: readFileSync(join(sourceDir, 'notes', name), 'utf8') }));

let built;
try {
  built = buildSampleCampaign({ source, notes, imageSizes, records, icons, availableIcons });
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
const { parts, media } = built!;

// The same layout CampaignPackager.exportTo writes (apps/desktop/src/main/campaign/campaignPackage.ts).
const mtime = new Date(SAMPLE_TIME);
const zip = new yazl.ZipFile();
const json = (path: string, value: unknown) =>
  zip.addBuffer(Buffer.from(JSON.stringify(value, null, 2)), path, { mtime });
json('campaign/campaign.json', parts.campaign);
for (const folder of ['pcs', 'encounters', 'adventures', 'notes', 'npcs', 'scenes'] as const) {
  for (const item of parts[folder]) json(`campaign/${folder}/${item.id}.json`, item);
}
for (const m of media) {
  zip.addBuffer(readFileSync(join(sourceDir, m.from)), `campaign/${m.to}`, {
    mtime,
    compress: false,
  });
}
const appVersion = (
  JSON.parse(readFileSync(join(root, 'apps', 'desktop', 'package.json'), 'utf8')) as {
    version: string;
  }
).version;
json('manifest.json', {
  kind: 'campaign',
  appVersion,
  librarySchemaVersion: LIBRARY_SCHEMA_VERSION,
  campaignSchemaVersion: CAMPAIGN_SCHEMA_VERSION,
  createdAt: SAMPLE_TIME,
  counts: { campaigns: 1, homebrew: 0, sources: 0 },
  campaign: {
    id: parts.campaign.id,
    name: parts.campaign.name,
    pcs: parts.pcs.length,
    options: { state: 'fresh', party: true, homebrew: true, layout: false },
  },
});
zip.end();

mkdirSync(outDir, { recursive: true });
const partial = `${target}.partial`;
pipeline(zip.outputStream, createWriteStream(partial)).then(
  () => {
    renameSync(partial, target);
    console.log(
      `build-sample: ${parts.campaign.name} → resources/sample/${NAME}.trifold-campaign ` +
        `(${parts.notes.length} notes, ${parts.scenes.length} scenes, ` +
        `${parts.encounters.length} encounters, ${media.length} images)`,
    );
  },
  (err: unknown) => fail(`could not write the package: ${String(err)}`),
);
