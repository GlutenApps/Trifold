import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '@trifold/api';
import { AppConfigStore } from './appConfig';
import type { Logger } from './log';
import type { SelfInstaller } from './updateInstaller';
import {
  RELEASES_API,
  RELEASES_PAGE,
  RETRY_DELAYS_MS,
  UpdateService,
  checkErrorMessage,
  readReleases,
  releaseFolder,
} from './updates';

const logger: Logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const NOW = new Date('2026-11-20T12:00:00Z');

let dir: string;
let config: AppConfigStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trifold-updates-'));
  config = await AppConfigStore.load(join(dir, 'config.json'), logger);
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true });
});

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  name: `Trifold ${tag}`,
  html_url: `${RELEASES_PAGE}tag/${tag}`,
  draft: false,
  prerelease: false,
  published_at: '2026-11-19T00:00:00Z',
  ...extra,
});

function answering(body: unknown, status = 200) {
  return vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));
}

function service(
  fetchImpl: ReturnType<typeof answering>,
  current = '0.3.0',
  installer: SelfInstaller | null = null,
) {
  const seen: UpdateStatus[] = [];
  const s = new UpdateService(
    config,
    logger,
    current,
    (st) => seen.push(st),
    fetchImpl,
    () => NOW,
    installer,
  );
  return { s, seen };
}

/** A SelfInstaller whose download the test finishes by hand. */
function fakeInstaller() {
  let finish: { resolve(): void; reject(err: Error): void } | null = null;
  let progress: (percent: number) => void = () => undefined;
  const installer = {
    download: vi.fn(
      (_version: string, onProgress: (percent: number) => void) =>
        new Promise<void>((resolve, reject) => {
          progress = onProgress;
          finish = { resolve, reject };
        }),
    ),
    install: vi.fn(() => true),
  };
  return {
    installer,
    progress: (p: number) => progress(p),
    succeed: () => finish?.resolve(),
    fail: (message: string) => finish?.reject(new Error(message)),
  };
}

/** Lets settled promises run their callbacks (real timers). */
const settle = () => new Promise((done) => setTimeout(done, 0));

/**
 * Fakes only the timers the service plans with; the config file's real writes still finish,
 * and `until` turns the real event loop until they have.
 */
const fakeTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
const realSetTimeout = globalThis.setTimeout;
async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 400 && !cond(); i++) await new Promise((done) => realSetTimeout(done, 5));
  expect(cond()).toBe(true);
}

describe('UpdateService', () => {
  it('is off and unasked by default, and its start does nothing then', () => {
    vi.useFakeTimers();
    const fetchImpl = answering([]);
    const { s } = service(fetchImpl);
    expect(s.status()).toMatchObject({ enabled: false, asked: false, available: null });
    s.start(0);
    vi.runAllTimers();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('turning it on records the answer and checks at once, sending only the app name and version', async () => {
    const fetchImpl = answering([release('v0.4.0'), release('v0.3.0')]);
    const { s, seen } = service(fetchImpl);
    await s.setEnabled(true);
    await vi.waitFor(() => expect(s.status().lastCheckAt).toBe(NOW.toISOString()));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe(RELEASES_API);
    expect(init.headers).toEqual({
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Trifold/0.3.0',
    });
    expect(s.status()).toMatchObject({
      enabled: true,
      asked: true,
      checking: false,
      available: { version: '0.4.0', url: `${RELEASES_PAGE}tag/v0.4.0` },
      dismissed: false,
      lastError: null,
    });
    expect(config.get().updates.enabled).toBe(true);
    expect(seen.some((st) => st.checking)).toBe(true);
  });

  it('No thanks records the answer and checks nothing', async () => {
    const fetchImpl = answering([]);
    const { s } = service(fetchImpl);
    expect(await s.setEnabled(false)).toMatchObject({ enabled: false, asked: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('checks at every launch when on, however recent the last check', async () => {
    fakeTimers();
    await config.update({
      updates: { ...config.get().updates, enabled: true, lastCheckAt: '2026-11-20T11:59:00Z' },
    });
    const fetchImpl = answering([]);
    const { s } = service(fetchImpl);
    s.start(5);
    vi.advanceTimersByTime(4);
    expect(fetchImpl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    s.stop();
  });

  it('retries a failed automatic check after a pause, then checks daily once it works', async () => {
    fakeTimers();
    await config.update({ updates: { ...config.get().updates, enabled: true } });
    let offline = true;
    const fetchImpl = vi.fn(async () => {
      if (offline) throw new Error('net::ERR_INTERNET_DISCONNECTED');
      return { ok: true, status: 200, json: async () => [] };
    });
    const { s } = service(fetchImpl as never);
    s.start(0);
    vi.advanceTimersByTime(0);
    await until(() => s.status().lastError === 'This computer is offline' && !s.status().checking);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(RETRY_DELAYS_MS[0]! - 1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    offline = false;
    vi.advanceTimersByTime(1);
    await until(() => s.status().lastError === null && !s.status().checking);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // Back to daily: nothing at the next retry pause, then one check a day later.
    vi.advanceTimersByTime(RETRY_DELAYS_MS[1]!);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await until(() => !s.status().checking);
    s.stop();
  });

  it('a manual check does not set up retries', async () => {
    fakeTimers();
    const fetchImpl = vi.fn(async () => {
      throw new Error('net::ERR_NAME_NOT_RESOLVED');
    });
    const { s } = service(fetchImpl as never);
    await s.check('manual');
    vi.advanceTimersByTime(RETRY_DELAYS_MS[0]!);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps the last good check when one fails, and says why', async () => {
    await config.update({
      updates: { ...config.get().updates, lastCheckAt: '2026-11-18T00:00:00Z' },
    });
    const { s } = service(answering({ message: 'rate limited' }, 403));
    const after = await s.check('manual');
    expect(after).toMatchObject({
      lastCheckAt: '2026-11-18T00:00:00Z',
      lastError: 'The release list asked Trifold to wait (too many checks from this network)',
      checking: false,
    });
    expect((await service(answering({}, 500)).s.check('manual')).lastError).toBe(
      'The release list answered 500',
    );

    const thrown = vi.fn(async () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    });
    const { s: slow } = service(thrown as never);
    expect((await slow.check('manual')).lastError).toBe('The release list did not answer in time');
  });

  it('runs one check at a time', async () => {
    const fetchImpl = answering([release('v0.4.0')]);
    const { s } = service(fetchImpl);
    const [a, b] = await Promise.all([s.check('manual'), s.check('manual')]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(a.available?.version).toBe('0.4.0');
    expect(b.available?.version).toBe('0.4.0');
  });

  it('never offers a page outside the project releases', async () => {
    const { s } = service(
      answering([release('v0.4.0', { html_url: 'https://elsewhere.example/v0.4.0' })]),
    );
    expect((await s.check('manual')).available).toBeNull();
    expect(s.downloadUrl()).toBeNull();
  });

  it('dismissing hides the version found until a newer one comes', async () => {
    const { s } = service(answering([release('v0.4.0')]));
    await s.check('manual');
    expect(s.downloadUrl()).toBe(`${RELEASES_PAGE}tag/v0.4.0`);
    expect((await s.dismiss()).dismissed).toBe(true);

    const { s: later } = service(answering([release('v0.4.0'), release('v0.5.0')]));
    expect((await later.check('manual')).dismissed).toBe(false);
  });

  it('shows nothing once the running build has caught up', async () => {
    const { s } = service(answering([release('v0.4.0')]));
    await s.check('manual');
    const updated = new UpdateService(config, logger, '0.4.0', () => undefined, answering([]));
    expect(updated.status().available).toBeNull();
  });
});

describe('readReleases', () => {
  it('reads what it can and skips malformed entries', () => {
    expect(readReleases([release('v0.4.0'), { tag_name: 3 }, null])).toHaveLength(1);
    expect(() => readReleases({ message: 'Not Found' })).toThrow(/not a list/);
  });
});

describe('UpdateService with an installer (ADR 0045)', () => {
  it('opens the release page where it cannot install, and downloads in the background where it can', async () => {
    const browser = service(answering([release('v0.4.0')]));
    expect(await browser.s.check('manual')).toMatchObject({
      mode: 'browser',
      download: { state: 'idle' },
    });

    const f = fakeInstaller();
    const { s, seen } = service(answering([release('v0.4.0')]), '0.3.0', f.installer);
    await s.check('manual');
    expect(f.installer.download).toHaveBeenCalledWith('0.4.0', expect.any(Function));
    expect(s.status()).toMatchObject({ mode: 'install', download: { state: 'downloading' } });
    expect(s.readyToInstall()).toBe(false);
    expect(s.install()).toBe(false);

    f.progress(41.7);
    f.progress(41.9);
    expect(s.status().download.percent).toBe(41);
    expect(seen.filter((st) => st.download.percent === 41)).toHaveLength(1);

    f.succeed();
    await settle();
    expect(s.status().download).toEqual({ state: 'ready', percent: 100, error: null });
    expect(f.installer.install).not.toHaveBeenCalled();
    expect(s.install()).toBe(true);
    expect(f.installer.install).toHaveBeenCalledTimes(1);
  });

  it('downloads a version once, and a later check reuses the ready installer', async () => {
    const f = fakeInstaller();
    const { s } = service(answering([release('v0.4.0')]), '0.3.0', f.installer);
    await s.check('manual');
    await s.check('manual');
    expect(f.installer.download).toHaveBeenCalledTimes(1);
    f.succeed();
    await settle();
    await s.check('manual');
    expect(f.installer.download).toHaveBeenCalledTimes(1);
    expect(s.readyToInstall()).toBe(true);
  });

  it('a failed download is quiet, says why and is tried again', async () => {
    fakeTimers();
    await config.update({ updates: { ...config.get().updates, enabled: true } });
    const f = fakeInstaller();
    const { s } = service(answering([release('v0.4.0')]), '0.3.0', f.installer);
    s.start(0);
    vi.advanceTimersByTime(0);
    await until(() => f.installer.download.mock.calls.length === 1 && !s.status().checking);
    f.fail('The update manifest’s signature did not verify, so it was refused');
    await until(() => s.status().download.state === 'failed');
    expect(s.status().download).toEqual({
      state: 'failed',
      percent: 0,
      error: 'The update manifest’s signature did not verify, so it was refused',
    });
    expect(s.install()).toBe(false);
    expect(s.downloadUrl()).toBe(`${RELEASES_PAGE}tag/v0.4.0`);

    vi.advanceTimersByTime(RETRY_DELAYS_MS[0]!);
    await until(() => f.installer.download.mock.calls.length === 2);
    s.stop();
  });

  it('nothing is ready once the running build has caught up', async () => {
    const f = fakeInstaller();
    const { s } = service(answering([release('v0.4.0')]), '0.3.0', f.installer);
    await s.check('manual');
    f.succeed();
    await settle();
    const updated = new UpdateService(
      config,
      logger,
      '0.4.0',
      () => undefined,
      answering([]),
      () => NOW,
      f.installer,
    );
    expect(updated.status()).toMatchObject({ available: null, download: { state: 'idle' } });
    expect(updated.install()).toBe(false);
  });
});

describe('releaseFolder and checkErrorMessage', () => {
  it('points at the tag’s download folder inside the project releases', () => {
    expect(releaseFolder('0.5.0')).toBe(`${RELEASES_PAGE}download/v0.5.0/`);
    expect(releaseFolder('1.0.0-beta.1')).toBe(`${RELEASES_PAGE}download/v1.0.0-beta.1/`);
  });

  it('turns offline errors into plain words', () => {
    expect(checkErrorMessage(new Error('net::ERR_INTERNET_DISCONNECTED'))).toBe(
      'This computer is offline',
    );
    expect(checkErrorMessage('odd')).toBe('odd');
  });
});
