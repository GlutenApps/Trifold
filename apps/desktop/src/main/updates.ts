import type { UpdateDownload, UpdateStatus } from '@trifold/api';
import {
  isNewer,
  newestRelease,
  UPDATE_CHECK_INTERVAL_MS,
  type AvailableUpdate,
  type ReleaseInfo,
} from '@trifold/rules';
import type { AppConfig } from '@trifold/schema';
import type { AppConfigStore } from './appConfig';
import type { Logger } from './log';
import type { SelfInstaller } from './updateInstaller';

/**
 * The update check (ADR 0034, DESIGN.md §10 Beta 2) and in-app updates (ADR 0045). The one
 * network feature the app starts by itself, and only after the DM turned it on: a few seconds
 * after launch, once a day while it stays open, and when they press Check now. It reads the
 * project's public releases list and sends no identifier beyond the app's name and version.
 *
 * What a found update leads to depends on the build. The installed Windows build hands the
 * version to a `SelfInstaller`, which fetches the release's signed manifest and downloads the
 * installer in the background; it runs only when the DM chooses Restart to update. Every other
 * build opens the release's page in the browser.
 *
 * A failed automatic check or download is quiet: the reason shows in Settings, and it is tried
 * again after `RETRY_DELAYS_MS`, then daily.
 *
 * The two addresses below are the only place the repo names the release host (ADR 0034
 * amends CLAUDE.md ground rule 1 for them). A page outside `RELEASES_PAGE` is never opened, and
 * installers come only from its `download/` folder.
 */
export const RELEASES_API = 'https://api.github.com/repos/GlutenApps/Trifold/releases?per_page=20';
export const RELEASES_PAGE = 'https://github.com/GlutenApps/Trifold/releases/';

/** How long a check may take before it is given up. */
const TIMEOUT_MS = 10_000;
/** The pause after launch before an automatic check, so it never competes with opening. */
export const AUTO_CHECK_DELAY_MS = 10_000;
/** After a failed automatic check or download: try again after these pauses, then daily. */
export const RETRY_DELAYS_MS: readonly number[] = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

/** The download folder of the release tagged `v<version>`: its manifest and installer. */
export function releaseFolder(version: string): string {
  return `${RELEASES_PAGE}download/v${encodeURIComponent(version)}/`;
}

type Fetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

type UpdatesConfig = AppConfig['updates'];

/** The releases list as GitHub answers it, read leniently: a malformed entry is skipped. */
export function readReleases(body: unknown): ReleaseInfo[] {
  if (!Array.isArray(body)) throw new Error('The releases list was not a list');
  const out: ReleaseInfo[] = [];
  for (const item of body) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.tag_name !== 'string' || typeof r.html_url !== 'string') continue;
    out.push({
      tag: r.tag_name,
      name: typeof r.name === 'string' ? r.name : '',
      url: r.html_url,
      draft: r.draft === true,
      prerelease: r.prerelease === true,
      publishedAt: typeof r.published_at === 'string' ? r.published_at : null,
    });
  }
  return out;
}

/** Only the project's own release pages are ever opened. */
export function isReleasePage(url: string): boolean {
  return url.startsWith(RELEASES_PAGE) && !/[\s"'<>]/.test(url);
}

const OFFLINE =
  /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_CHANGED|ERR_NETWORK_IO_SUSPENDED|ENOTFOUND|EAI_AGAIN/;

/** A failed check's or download's reason in the DM's words; offline is the usual one. */
export function checkErrorMessage(err: unknown): string {
  if (err instanceof Error && err.name === 'TimeoutError') {
    return 'The release list did not answer in time';
  }
  const message = err instanceof Error ? err.message : String(err);
  if (OFFLINE.test(message)) return 'This computer is offline';
  return message;
}

const IDLE: UpdateDownload = { state: 'idle', percent: 0, error: null };

export class UpdateService {
  private checking: Promise<UpdateStatus> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Failed automatic attempts in a row, for `RETRY_DELAYS_MS`. */
  private failures = 0;
  private download: UpdateDownload & { version: string | null } = { ...IDLE, version: null };

  constructor(
    private readonly config: AppConfigStore,
    private readonly logger: Logger,
    private readonly current: string,
    private readonly notify: (status: UpdateStatus) => void,
    private readonly fetchImpl: Fetch,
    private readonly now: () => Date = () => new Date(),
    /** The installed Windows build's installer; null where updates open the release page. */
    private readonly installer: SelfInstaller | null = null,
  ) {}

  private get saved(): UpdatesConfig {
    return this.config.get().updates;
  }

  private async save(patch: Partial<UpdatesConfig>): Promise<void> {
    await this.config.update({ updates: { ...this.saved, ...patch } });
  }

  status(): UpdateStatus {
    const u = this.saved;
    // Once this build has caught up (the DM installed the update), nothing is available.
    const available =
      u.available && isNewer(u.available.version, this.current) ? u.available : null;
    const { version, ...download } = this.download;
    return {
      current: this.current,
      enabled: u.enabled,
      asked: u.asked,
      checking: this.checking !== null,
      lastCheckAt: u.lastCheckAt,
      available,
      dismissed: !!available && u.dismissedVersion === available.version,
      lastError: u.lastError,
      mode: this.installer ? 'install' : 'browser',
      download: available && version === available.version ? download : IDLE,
    };
  }

  /** Called once at startup: when the check is on, checks a few seconds after launch. */
  start(delayMs = AUTO_CHECK_DELAY_MS): void {
    if (this.saved.enabled) this.schedule(delayMs);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Plans the next automatic check, replacing any already planned. */
  private schedule(delayMs: number): void {
    this.stop();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.check('automatic');
    }, delayMs);
  }

  /** After an automatic attempt: again in a day on success, sooner after a failure. */
  private scheduleNext(failed: boolean): void {
    if (!this.saved.enabled) return;
    this.failures = failed ? this.failures + 1 : 0;
    const retry = failed ? RETRY_DELAYS_MS[this.failures - 1] : undefined;
    this.schedule(retry ?? UPDATE_CHECK_INTERVAL_MS);
  }

  async setEnabled(enabled: boolean): Promise<UpdateStatus> {
    await this.save({ enabled, asked: true });
    this.logger.info(`update check turned ${enabled ? 'on' : 'off'}`);
    if (!enabled) this.stop();
    this.notify(this.status());
    if (enabled) void this.check('automatic');
    return this.status();
  }

  async dismiss(): Promise<UpdateStatus> {
    const available = this.status().available;
    if (available) await this.save({ dismissedVersion: available.version });
    this.notify(this.status());
    return this.status();
  }

  /** The found release's page, when it is one of the project's own. */
  downloadUrl(): string | null {
    const url = this.status().available?.url;
    return url && isReleasePage(url) ? url : null;
  }

  /** Whether a downloaded installer is waiting for Restart to update. */
  readyToInstall(): boolean {
    return this.installer !== null && this.status().download.state === 'ready';
  }

  /** Starts the downloaded installer; the caller has already run the close flow. */
  install(): boolean {
    if (!this.installer || !this.readyToInstall()) return false;
    const started = this.installer.install();
    if (started) this.logger.info(`installing ${this.download.version ?? '?'} and restarting`);
    else this.logger.warn('the update installer did not start');
    return started;
  }

  /** One check at a time; a second call while one runs gets the same answer. */
  check(reason: 'automatic' | 'manual'): Promise<UpdateStatus> {
    if (!this.checking) {
      this.checking = this.run(reason).finally(() => {
        this.checking = null;
        this.notify(this.status());
      });
      this.notify(this.status());
    }
    return this.checking;
  }

  private async run(reason: 'automatic' | 'manual'): Promise<UpdateStatus> {
    this.logger.info(`update check (${reason}) started`);
    try {
      const res = await this.fetchImpl(RELEASES_API, {
        headers: {
          Accept: 'application/vnd.github+json',
          // GitHub requires a user agent; the app's name and version, nothing about the DM.
          'User-Agent': `Trifold/${this.current}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 403 || res.status === 429) {
        throw new Error(
          'The release list asked Trifold to wait (too many checks from this network)',
        );
      }
      if (!res.ok) throw new Error(`The release list answered ${res.status}`);
      const found: AvailableUpdate | null = newestRelease(
        readReleases(await res.json()),
        this.current,
      );
      const available = found && isReleasePage(found.url) ? found : null;
      await this.save({ lastCheckAt: this.now().toISOString(), available, lastError: null });
      this.logger.info(
        `update check (${reason}): ${available ? `${available.version} is available` : 'up to date'}`,
      );
      if (reason === 'automatic') this.scheduleNext(false);
      if (available) this.fetchInstaller(available.version, reason);
    } catch (err) {
      const message = checkErrorMessage(err);
      await this.save({ lastError: message });
      this.logger.warn(`update check (${reason}) failed: ${message}`);
      if (reason === 'automatic') this.scheduleNext(true);
    }
    return { ...this.status(), checking: false };
  }

  /** Downloads `version`'s installer in the background, once; progress arrives as events. */
  private fetchInstaller(version: string, reason: 'automatic' | 'manual'): void {
    const installer = this.installer;
    if (!installer) return;
    const d = this.download;
    if (d.version === version && (d.state === 'downloading' || d.state === 'ready')) return;
    this.download = { state: 'downloading', percent: 0, error: null, version };
    this.notify(this.status());
    this.logger.info(`downloading the ${version} installer`);
    installer
      .download(version, (percent) => {
        const p = Math.min(99, Math.floor(percent));
        if (this.download.version !== version || p === this.download.percent) return;
        this.download = { ...this.download, percent: p };
        this.notify(this.status());
      })
      .then(
        () => {
          this.download = { state: 'ready', percent: 100, error: null, version };
          this.logger.info(`the ${version} installer is ready; waiting for Restart to update`);
        },
        (err: unknown) => {
          const message = checkErrorMessage(err);
          this.download = { state: 'failed', percent: 0, error: message, version };
          this.logger.warn(`downloading the ${version} installer failed: ${message}`);
          if (reason === 'automatic') this.scheduleNext(true);
        },
      )
      .finally(() => this.notify(this.status()));
  }
}
