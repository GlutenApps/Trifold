import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CampaignPackageResult, SampleCampaignStatus } from '@trifold/api';
import type { LibraryStore } from '../library/LibraryStore';
import { errorMessage, type Logger } from '../log';
import type { CampaignPackager } from './campaignPackage';

/** Where the build puts the sample, inside the bundled resources folder (scripts/build-sample.ts). */
export const SAMPLE_PACKAGE = join('sample', 'greyford.trifold-campaign');

/**
 * The bundled sample campaign (ADR 0016): a `.trifold-campaign` that ships with the app and goes
 * into a Library through the ordinary campaign import. Every Library gets it once, new or
 * existing, and `library.json` remembers that, so a DM who deletes it never sees it come back
 * unasked. Settings › Sample campaign adds it again, or puts it back as shipped.
 */
export class SampleCampaign {
  constructor(
    readonly path: string,
    private readonly logger: Logger,
  ) {}

  /** False in a build without the sample (a dev checkout that never ran `pnpm build:sample`). */
  get available(): boolean {
    return existsSync(this.path);
  }

  async status(packager: CampaignPackager): Promise<SampleCampaignStatus> {
    if (!this.available) return { available: false, present: false, name: null };
    const info = await packager.inspect(this.path);
    return {
      available: info.problem === null,
      present: info.existing !== null,
      name: info.manifest?.campaign?.name ?? null,
    };
  }

  /**
   * Adds the sample the first time this Library opens with this feature. Never throws: a sample
   * that cannot be added is logged and tried again next open, and never stops the Library opening.
   */
  async seedOnce(store: LibraryStore, packager: CampaignPackager): Promise<void> {
    if (store.getSettings().sampleCampaign.added) return;
    if (!this.available) {
      this.logger.warn(`sample campaign not bundled (${this.path}); skipped`);
      return;
    }
    try {
      const info = await packager.inspect(this.path);
      if (info.problem) throw new Error(info.problem);
      // A Library that already has it (imported by hand) just gets the flag.
      if (!info.existing) await packager.importFrom(this.path, 'new');
      await store.updateSettings({ sampleCampaign: { added: true } });
      this.logger.info(`sample campaign ${info.existing ? 'already present' : 'added'}`);
    } catch (err) {
      this.logger.error(`sample campaign not added: ${errorMessage(err)}`);
    }
  }

  /**
   * Settings › Sample campaign: adds it when it is missing, or replaces it with the shipped copy
   * when it is there (`replace` writes a safety backup first).
   */
  async add(store: LibraryStore, packager: CampaignPackager): Promise<CampaignPackageResult> {
    if (!this.available) throw new Error('This build of Trifold has no sample campaign');
    const info = await packager.inspect(this.path);
    if (info.problem) throw new Error(info.problem);
    const result = await packager.importFrom(this.path, info.existing ? 'replace' : 'new');
    if (!store.getSettings().sampleCampaign.added) {
      await store.updateSettings({ sampleCampaign: { added: true } });
    }
    return result;
  }
}
