import type { OutgoingHttpHeaders } from 'node:http';
import { NsisUpdater, Provider, type ProgressInfo, type UpdateInfo } from 'electron-updater';
import {
  parseUpdateInfo,
  resolveFiles,
  type ProviderRuntimeOptions,
} from 'electron-updater/out/providers/Provider';
import type { ResolvedUpdateFileInfo } from 'electron-updater/out/types';
import type { Logger } from './log';
import { SIGNATURE_SUFFIX, UPDATE_PUBLIC_KEYS, verifyManifest } from './updateSignature';

/**
 * In-app updates on Windows (ADR 0045): electron-updater downloads and runs the NSIS installer,
 * reading the release through `SignedManifestProvider` so nothing is fetched or installed unless
 * the release's `latest.yml` carries a valid signature. The update check in updates.ts decides
 * whether a newer version exists; this only fetches and installs one it was told about.
 */
export interface SelfInstaller {
  /**
   * Reads the signed manifest of `version`'s release and downloads its installer into
   * electron-updater's cache (a cached copy with the right hash is reused). Rejects when the
   * manifest is missing, unsigned, signed by an unknown key or for another version.
   */
  download(version: string, onProgress: (percent: number) => void): Promise<void>;
  /** Starts the downloaded installer (its progress window only), to relaunch Trifold when done; false when none. */
  install(): boolean;
}

/** The manifest the NSIS target is read from. */
const MANIFEST = 'latest.yml';

/** What this build is, for `selfUpdateBlocker`. */
export interface BuildFacts {
  platform: NodeJS.Platform;
  packaged: boolean;
  windowsStore: boolean;
  /** Set by the portable exe's launcher (electron-builder's portable target). */
  portable: boolean;
  keys: readonly string[];
}

/**
 * Why this build cannot install updates itself, or null when it can. Only the installed Windows
 * build can: the portable exe has nowhere to install to, a Store build updates through the Store,
 * macOS keeps the release page until it is notarized (ADR 0045), and a build without a public
 * key could not verify anything.
 */
export function selfUpdateBlocker(facts: BuildFacts): string | null {
  if (facts.platform !== 'win32') return 'not Windows';
  if (!facts.packaged) return 'not a packaged build';
  if (facts.windowsStore) return 'a Microsoft Store build';
  if (facts.portable) return 'the portable build';
  if (facts.keys.length === 0) return 'no update key in this build';
  return null;
}

/** The options `setFeedURL` hands to the provider. */
interface SignedFeedOptions {
  provider: 'custom';
  updateProvider: typeof SignedManifestProvider;
  /** The release's download folder, ending in `/`. */
  baseUrl: string;
  /** The version the update check found; the manifest must name the same one. */
  version: string;
  keys: readonly string[];
}

/**
 * electron-updater's custom provider: fetches `latest.yml` and `latest.yml.sig` from the release
 * the check found and returns the manifest only when the signature holds. It also drops the
 * random install ID electron-updater would otherwise send as a request header, so the request
 * carries nothing about the DM (CLAUDE.md ground rule 1).
 */
export class SignedManifestProvider extends Provider<UpdateInfo> {
  private readonly base: URL;
  private readonly version: string;
  private readonly keys: readonly string[];

  constructor(o: SignedFeedOptions, _updater: unknown, runtime: ProviderRuntimeOptions) {
    super({ ...runtime, isUseMultipleRangeRequest: false });
    this.base = new URL(o.baseUrl);
    this.version = o.version;
    this.keys = o.keys;
  }

  /** Whatever electron-updater asks to add (its install ID), the requests carry none of it. */
  override setRequestHeaders(_value: OutgoingHttpHeaders | null): void {
    super.setRequestHeaders(null);
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    const manifestUrl = new URL(MANIFEST, this.base);
    const [text, signature] = await Promise.all([
      this.httpRequest(manifestUrl),
      this.httpRequest(new URL(MANIFEST + SIGNATURE_SUFFIX, this.base)),
    ]);
    if (text == null || signature == null) {
      throw new Error('The release has no signed update manifest');
    }
    if (!verifyManifest(text, signature, this.keys)) {
      throw new Error('The update manifest’s signature did not verify, so it was refused');
    }
    const info = parseUpdateInfo(text, MANIFEST, manifestUrl);
    if (info.version !== this.version) {
      throw new Error(`The signed manifest is for ${info.version}, not ${this.version}`);
    }
    return info;
  }

  resolveFiles(info: UpdateInfo): ResolvedUpdateFileInfo[] {
    const files = resolveFiles(info, this.base);
    // A signed manifest is trusted, but its files still have to come from the same release.
    for (const f of files) {
      if (!f.url.href.startsWith(this.base.href)) {
        throw new Error(`The update manifest points outside its release: ${f.url.href}`);
      }
    }
    return files;
  }
}

/** The installed Windows build's installer, through electron-updater's NsisUpdater. */
export class NsisSelfInstaller implements SelfInstaller {
  private readonly updater = new NsisUpdater();
  private ready = false;

  constructor(
    private readonly logger: Logger,
    /** The download folder of the release tagged `v<version>`. */
    private readonly releaseFolder: (version: string) => string,
    private readonly keys: readonly string[] = UPDATE_PUBLIC_KEYS,
  ) {
    const u = this.updater;
    // Trifold decides when to check, download and install; electron-updater does none by itself.
    u.autoDownload = false;
    u.autoInstallOnAppQuit = false;
    u.allowDowngrade = false;
    // latest.yml is rewritten after signing (release.yml), so no blockmaps are published.
    u.disableDifferentialDownload = true;
    u.disableWebInstaller = true;
    u.logger = {
      info: (m: unknown) => logger.info(`updater: ${String(m)}`),
      warn: (m: unknown) => logger.warn(`updater: ${String(m)}`),
      error: (m: unknown) => logger.warn(`updater: ${String(m)}`),
      debug: () => undefined,
    };
  }

  async download(version: string, onProgress: (percent: number) => void): Promise<void> {
    this.ready = false;
    const feed: SignedFeedOptions = {
      provider: 'custom',
      updateProvider: SignedManifestProvider,
      baseUrl: this.releaseFolder(version),
      version,
      keys: this.keys,
    };
    this.updater.setFeedURL(feed);
    const progress = (p: ProgressInfo) => onProgress(p.percent);
    this.updater.on('download-progress', progress);
    try {
      const result = await this.updater.checkForUpdates();
      if (!result?.isUpdateAvailable) {
        throw new Error(`The signed manifest does not offer an update to ${version}`);
      }
      await this.updater.downloadUpdate();
      this.ready = true;
    } finally {
      this.updater.off('download-progress', progress);
    }
  }

  install(): boolean {
    if (!this.ready) return false;
    // Not silent: the installer shows its progress bar alone (build/installer.nsh skips every
    // other page on an update), so the DM can see the update running until the new version
    // starts (ADR 0053). It keeps the folder and install mode they chose.
    return this.updater.install(false, true);
  }
}
