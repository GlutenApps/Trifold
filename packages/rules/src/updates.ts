/**
 * The update check's rules (ADR 0034), kept pure so they are tested without a network: version
 * comparison, which published release (if any) is newer than the running build, and when the
 * next automatic check is due. Main asks for the releases; this decides what they mean.
 */

export interface Version {
  major: number;
  minor: number;
  patch: number;
  /** Pre-release identifiers (`1.2.0-beta.3` → `['beta', '3']`); empty for a release. */
  pre: string[];
}

/** `1.2.3`, `v1.2.3` or `1.2.3-beta.1` (build metadata after `+` ignored); null otherwise. */
export function parseVersion(text: string): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(text.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ? m[4].split('.') : [],
  };
}

/** Semantic Versioning order: negative when `a` is older than `b`, 0 when equal. */
export function compareVersions(a: Version, b: Version): number {
  const core = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (core !== 0) return Math.sign(core);
  // A release is newer than any of its pre-releases.
  if (a.pre.length === 0 || b.pre.length === 0) return Math.sign(b.pre.length - a.pre.length);
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      const d = Number(x) - Number(y);
      if (d !== 0) return Math.sign(d);
    } else if (xn !== yn) {
      return xn ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** One published release, as the update check reads it. */
export interface ReleaseInfo {
  /** The tag, such as `v0.4.0`. */
  tag: string;
  name: string;
  /** The release's page. */
  url: string;
  draft: boolean;
  prerelease: boolean;
  publishedAt: string | null;
}

export interface AvailableUpdate {
  version: string;
  name: string;
  url: string;
  publishedAt: string | null;
}

/**
 * The newest release newer than `current`, or null. Drafts and tags that are not versions are
 * skipped. Pre-releases count only when the running build is itself a pre-release, so a stable
 * build is never pointed at a test one.
 */
export function newestRelease(
  releases: readonly ReleaseInfo[],
  current: string,
): AvailableUpdate | null {
  const running = parseVersion(current);
  if (!running) return null;
  const allowPre = running.pre.length > 0;
  let best: { release: ReleaseInfo; version: Version } | null = null;
  for (const release of releases) {
    if (release.draft) continue;
    const version = parseVersion(release.tag);
    if (!version) continue;
    if ((release.prerelease || version.pre.length > 0) && !allowPre) continue;
    if (compareVersions(version, running) <= 0) continue;
    if (!best || compareVersions(version, best.version) > 0) best = { release, version };
  }
  if (!best) return null;
  return {
    version: best.release.tag.replace(/^v/, ''),
    name: best.release.name || best.release.tag,
    url: best.release.url,
    publishedAt: best.release.publishedAt,
  };
}

/** Whether `version` is newer than `current`; false when either is not a version. */
export function isNewer(version: string, current: string): boolean {
  const a = parseVersion(version);
  const b = parseVersion(current);
  return !!a && !!b && compareVersions(a, b) > 0;
}

/** The automatic check runs at most once a day. */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Whether an automatic check is due: never checked, or the last check is a day old. */
export function isUpdateCheckDue(
  lastCheckAt: string | null,
  now: Date,
  intervalMs = UPDATE_CHECK_INTERVAL_MS,
): boolean {
  if (!lastCheckAt) return true;
  const last = Date.parse(lastCheckAt);
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= intervalMs;
}
