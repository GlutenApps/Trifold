import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '@trifold/api';
import { AppConfigStore } from './appConfig';
import type { Logger } from './log';
import { RELEASES_API, RELEASES_PAGE, UpdateService, readReleases } from './updates';

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

function service(fetchImpl: ReturnType<typeof answering>, current = '0.3.0') {
  const seen: UpdateStatus[] = [];
  const s = new UpdateService(
    config,
    logger,
    current,
    (st) => seen.push(st),
    fetchImpl,
    () => NOW,
  );
  return { s, seen };
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

  it('checks automatically only when on and a day has passed', async () => {
    vi.useFakeTimers();
    await config.update({
      updates: { ...config.get().updates, enabled: true, lastCheckAt: '2026-11-20T08:00:00Z' },
    });
    const fetchImpl = answering([]);
    service(fetchImpl).s.start(5);
    vi.runAllTimers();
    expect(fetchImpl).not.toHaveBeenCalled();

    await config.update({
      updates: { ...config.get().updates, lastCheckAt: '2026-11-19T08:00:00Z' },
    });
    service(fetchImpl).s.start(5);
    vi.advanceTimersByTime(5);
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
      lastError: 'The release list answered 403',
      checking: false,
    });

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
