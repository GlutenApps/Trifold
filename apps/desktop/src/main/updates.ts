import type { UpdateStatus } from '@trifold/api';
import {
  isNewer,
  isUpdateCheckDue,
  newestRelease,
  type AvailableUpdate,
  type ReleaseInfo,
} from '@trifold/rules';
import type { AppConfig } from '@trifold/schema';
import type { AppConfigStore } from './appConfig';
import type { Logger } from './log';

/**
 * The update check (ADR 0034, DESIGN.md §10 Beta 2). The one network request the app makes by
 * itself, and only after the DM turned it on: at most once a day, a few seconds after launch, or
 * when they press Check now. It reads the project's public releases list and nothing else,
 * sends no identifier beyond the app's name and version, and never downloads or installs
 * anything: Download opens the release's page in the browser.
 *
 * The two addresses below are the only place the repo names the release host (ADR 0034
 * amends CLAUDE.md ground rule 1 for them). A page outside `RELEASES_PAGE` is never opened.
 */
export const RELEASES_API = 'https://api.github.com/repos/GlutenApps/Trifold/releases?per_page=20';
export const RELEASES_PAGE = 'https://github.com/GlutenApps/Trifold/releases/';

/** How long a check may take before it is given up. */
const TIMEOUT_MS = 10_000;
/** The pause after launch before an automatic check, so it never competes with opening. */
export const AUTO_CHECK_DELAY_MS = 10_000;

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

export class UpdateService {
  private checking: Promise<UpdateStatus> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly config: AppConfigStore,
    private readonly logger: Logger,
    private readonly current: string,
    private readonly notify: (status: UpdateStatus) => void,
    private readonly fetchImpl: Fetch,
    private readonly now: () => Date = () => new Date(),
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
    return {
      current: this.current,
      enabled: u.enabled,
      asked: u.asked,
      checking: this.checking !== null,
      lastCheckAt: u.lastCheckAt,
      available,
      dismissed: !!available && u.dismissedVersion === available.version,
      lastError: u.lastError,
    };
  }

  /** Called once at startup: schedules the day's automatic check when it is on and due. */
  start(delayMs = AUTO_CHECK_DELAY_MS): void {
    if (!this.saved.enabled || !isUpdateCheckDue(this.saved.lastCheckAt, this.now())) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.check('automatic');
    }, delayMs);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async setEnabled(enabled: boolean): Promise<UpdateStatus> {
    await this.save({ enabled, asked: true });
    this.logger.info(`update check turned ${enabled ? 'on' : 'off'}`);
    if (!enabled) this.stop();
    this.notify(this.status());
    if (enabled && isUpdateCheckDue(this.saved.lastCheckAt, this.now()))
      void this.check('automatic');
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
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'TimeoutError'
          ? 'The release list did not answer in time'
          : err instanceof Error
            ? err.message
            : String(err);
      await this.save({ lastError: message });
      this.logger.warn(`update check (${reason}) failed: ${message}`);
    }
    return { ...this.status(), checking: false };
  }
}
