import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  isNewer,
  isUpdateCheckDue,
  newestRelease,
  parseVersion,
  type ReleaseInfo,
} from './updates';

const v = (text: string) => parseVersion(text)!;

describe('parseVersion and compareVersions', () => {
  it('reads plain, v-prefixed and pre-release versions, and rejects anything else', () => {
    expect(parseVersion('0.3.0')).toEqual({ major: 0, minor: 3, patch: 0, pre: [] });
    expect(parseVersion('v1.2.3-beta.4+build.7')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      pre: ['beta', '4'],
    });
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('latest')).toBeNull();
  });

  it('orders versions as Semantic Versioning does', () => {
    const ordered = [
      '0.3.0',
      '0.3.1',
      '0.4.0-alpha',
      '0.4.0-alpha.1',
      '0.4.0-alpha.beta',
      '0.4.0-beta.2',
      '0.4.0-beta.11',
      '0.4.0-rc.1',
      '0.4.0',
      '0.10.0',
      '1.0.0',
    ];
    for (let i = 1; i < ordered.length; i++) {
      expect(compareVersions(v(ordered[i - 1]!), v(ordered[i]!))).toBe(-1);
      expect(compareVersions(v(ordered[i]!), v(ordered[i - 1]!))).toBe(1);
    }
    expect(compareVersions(v('v1.0.0'), v('1.0.0'))).toBe(0);
  });

  it('says whether one version is newer than another', () => {
    expect(isNewer('0.4.0', '0.3.0')).toBe(true);
    expect(isNewer('0.3.0', '0.3.0')).toBe(false);
    expect(isNewer('nonsense', '0.3.0')).toBe(false);
  });
});

describe('newestRelease', () => {
  const release = (tag: string, extra: Partial<ReleaseInfo> = {}): ReleaseInfo => ({
    tag,
    name: `Trifold ${tag}`,
    url: `https://example.test/releases/tag/${tag}`,
    draft: false,
    prerelease: false,
    publishedAt: '2026-11-20T00:00:00Z',
    ...extra,
  });

  it('picks the newest release newer than the running one, skipping drafts and odd tags', () => {
    const found = newestRelease(
      [
        release('v0.3.0'),
        release('v0.5.0', { draft: true }),
        release('v0.4.1'),
        release('nightly'),
        release('v0.4.0'),
      ],
      '0.3.0',
    );
    expect(found).toEqual({
      version: '0.4.1',
      name: 'Trifold v0.4.1',
      url: 'https://example.test/releases/tag/v0.4.1',
      publishedAt: '2026-11-20T00:00:00Z',
    });
  });

  it('answers null when nothing is newer, or the running version cannot be read', () => {
    expect(newestRelease([release('v0.3.0'), release('v0.2.0')], '0.3.0')).toBeNull();
    expect(newestRelease([], '0.3.0')).toBeNull();
    expect(newestRelease([release('v9.0.0')], 'dev')).toBeNull();
  });

  it('offers pre-releases only to a build that is itself a pre-release', () => {
    const releases = [release('v0.4.0-beta.1', { prerelease: true }), release('v0.3.1')];
    expect(newestRelease(releases, '0.3.0')?.version).toBe('0.3.1');
    expect(newestRelease(releases, '0.4.0-alpha.2')?.version).toBe('0.4.0-beta.1');
    // A tag with a pre-release suffix counts as one even when the flag was not set.
    expect(newestRelease([release('v0.5.0-rc.1')], '0.3.0')).toBeNull();
  });

  it('falls back to the tag when a release has no name', () => {
    expect(newestRelease([release('v0.4.0', { name: '' })], '0.3.0')?.name).toBe('v0.4.0');
  });
});

describe('isUpdateCheckDue', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  it('is due when never checked, after a day, or when the stamp cannot be read', () => {
    expect(isUpdateCheckDue(null, now)).toBe(true);
    expect(isUpdateCheckDue('2026-11-19T11:59:59Z', now)).toBe(true);
    expect(isUpdateCheckDue('garbage', now)).toBe(true);
  });
  it('is not due within a day of the last check', () => {
    expect(isUpdateCheckDue('2026-11-20T01:00:00Z', now)).toBe(false);
  });
});
