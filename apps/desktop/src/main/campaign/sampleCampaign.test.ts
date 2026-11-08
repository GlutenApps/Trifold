import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CampaignExportOptions } from '@trifold/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupService } from '../backups';
import { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';
import { HomebrewRepository } from '../sources/homebrew';
import { CampaignPackager } from './campaignPackage';
import { CampaignRepository } from './repository';
import { SAMPLE_PACKAGE, SampleCampaign } from './sampleCampaign';

const logger: Logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

interface Library {
  root: string;
  store: LibraryStore;
  campaigns: CampaignRepository;
  packager: CampaignPackager;
}

async function library(): Promise<Library> {
  const root = await mkdtemp(join(tmpdir(), 'trifold-sample-'));
  const store = await LibraryStore.open(root);
  const campaigns = new CampaignRepository(store, logger);
  const packager = new CampaignPackager({
    store,
    campaigns,
    homebrew: new HomebrewRepository(store, logger),
    backups: new BackupService(store, logger),
    logger,
    appVersion: '0.0.0-test',
    hasRecord: () => true,
  });
  return { root, store, campaigns, packager };
}

describe('SampleCampaign', () => {
  let bundled: string;

  /** A stand-in for the bundled file: a small campaign exported from another Library. */
  beforeEach(async () => {
    const maker = await library();
    const bundle = await maker.campaigns.create('Lantern Sample');
    bundled = join(await mkdtemp(join(tmpdir(), 'trifold-bundle-')), 'sample.trifold-campaign');
    await maker.packager.exportTo(
      bundle.campaign.id,
      CampaignExportOptions.parse({ state: 'fresh' }),
      bundled,
    );
  });

  it('adds the sample to a Library once, and never again after it is deleted', async () => {
    const lib = await library();
    const sample = new SampleCampaign(bundled, logger);
    expect(lib.store.getSettings().sampleCampaign.added).toBe(false);

    await sample.seedOnce(lib.store, lib.packager);
    const [added] = await lib.campaigns.list();
    expect(added?.name).toBe('Lantern Sample');
    expect(lib.store.getSettings().sampleCampaign.added).toBe(true);
    expect(await sample.status(lib.packager)).toEqual({
      available: true,
      present: true,
      name: 'Lantern Sample',
    });

    await lib.campaigns.remove(added!.id);
    await sample.seedOnce(lib.store, lib.packager);
    expect(await lib.campaigns.list()).toEqual([]);
    expect((await sample.status(lib.packager)).present).toBe(false);

    // The flag is in library.json, so a reopened Library remembers it too.
    const reopened = await LibraryStore.open(lib.root);
    expect(reopened.getSettings().sampleCampaign.added).toBe(true);
  });

  it('adds it back on request, and resets it with a safety backup when present', async () => {
    const lib = await library();
    const sample = new SampleCampaign(bundled, logger);
    await sample.seedOnce(lib.store, lib.packager);
    const [first] = await lib.campaigns.list();
    await lib.campaigns.remove(first!.id);

    const added = await sample.add(lib.store, lib.packager);
    expect(added.mode).toBe('new');
    expect(await lib.campaigns.list()).toHaveLength(1);

    const reset = await sample.add(lib.store, lib.packager);
    expect(reset.mode).toBe('replace');
    expect(reset.safety).toMatch(/\.zip$/);
    expect(await lib.campaigns.list()).toHaveLength(1);
    expect(await readdir(join(lib.root, 'backups'))).toContain(reset.safety);
  });

  it('skips a build without the sample and tries again next time', async () => {
    const lib = await library();
    const missing = new SampleCampaign(join(lib.root, 'nowhere.trifold-campaign'), logger);
    await missing.seedOnce(lib.store, lib.packager);
    expect(await lib.campaigns.list()).toEqual([]);
    expect(lib.store.getSettings().sampleCampaign.added).toBe(false);
    expect(await missing.status(lib.packager)).toEqual({
      available: false,
      present: false,
      name: null,
    });
    await expect(missing.add(lib.store, lib.packager)).rejects.toThrow('no sample campaign');
  });

  it('does not add a second copy to a Library that imported it by hand', async () => {
    const lib = await library();
    await lib.packager.importFrom(bundled, 'new');
    await new SampleCampaign(bundled, logger).seedOnce(lib.store, lib.packager);
    expect(await lib.campaigns.list()).toHaveLength(1);
    expect(lib.store.getSettings().sampleCampaign.added).toBe(true);
  });

  // The real package, when this checkout has built it (`pnpm build:sample`).
  const real = join(__dirname, '..', '..', '..', '..', '..', 'resources', SAMPLE_PACKAGE);
  it.skipIf(!existsSync(real))('imports the bundled Greyford sample intact', async () => {
    const lib = await library();
    await new SampleCampaign(real, logger).seedOnce(lib.store, lib.packager);
    const [summary] = await lib.campaigns.list();
    expect(summary?.name).toBe('The Lantern at Greyford');
    const bundle = await lib.campaigns.bundleOf(summary!.slug);
    expect(bundle.pcs).toHaveLength(4);
    expect(bundle.encounters).toHaveLength(4);
    const gorge = bundle.scenes.find((s) => s.title === 'Grey Gorge')!;
    expect(gorge.tokens).toHaveLength(19);
    // Both backgrounds landed in the campaign folder.
    for (const background of gorge.backgrounds!) {
      const image = await readFile(
        join(lib.root, 'campaigns', summary!.slug, background.image.path),
      );
      expect(image.length).toBeGreaterThan(100_000);
    }
  });
});
