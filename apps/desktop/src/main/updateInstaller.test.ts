import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {}, net: {}, BrowserWindow: class {} }));

import { SignedManifestProvider, selfUpdateBlocker, type BuildFacts } from './updateInstaller';
import { verifyManifest } from './updateSignature';

/** A key pair as the keygen script makes it: the public half as the JWK `x`. */
function keyPair(): { x: string; privateKey: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { x: publicKey.export({ format: 'jwk' }).x!, privateKey };
}

const signed = (text: string, privateKey: KeyObject) =>
  sign(null, Buffer.from(text, 'utf8'), privateKey).toString('base64');

const MANIFEST = `version: 0.5.0
files:
  - url: Trifold-Setup-0.5.0-win-x64.exe
    sha512: c2hhNTEy
    size: 1234
path: Trifold-Setup-0.5.0-win-x64.exe
sha512: c2hhNTEy
releaseDate: '2026-11-19T00:00:00.000Z'
`;

describe('verifyManifest', () => {
  const current = keyPair();
  const spare = keyPair();
  const stranger = keyPair();

  it('accepts a manifest signed by the current or the spare key', () => {
    expect(verifyManifest(MANIFEST, signed(MANIFEST, current.privateKey), [current.x])).toBe(true);
    expect(
      verifyManifest(MANIFEST, `${signed(MANIFEST, spare.privateKey)}\n`, [current.x, spare.x]),
    ).toBe(true);
  });

  it('refuses another key, a changed manifest, junk and an empty key list', () => {
    const sig = signed(MANIFEST, current.privateKey);
    expect(verifyManifest(MANIFEST, signed(MANIFEST, stranger.privateKey), [current.x])).toBe(
      false,
    );
    expect(verifyManifest(MANIFEST.replace('size: 1234', 'size: 1235'), sig, [current.x])).toBe(
      false,
    );
    expect(verifyManifest(MANIFEST, 'not a signature', [current.x])).toBe(false);
    expect(verifyManifest(MANIFEST, sig, ['not-a-key', current.x])).toBe(true);
    expect(verifyManifest(MANIFEST, sig, [])).toBe(false);
  });
});

describe('selfUpdateBlocker', () => {
  const installed: BuildFacts = {
    platform: 'win32',
    packaged: true,
    windowsStore: false,
    portable: false,
    keys: ['k'],
  };

  it('lets only the installed, packaged Windows build with a key install updates', () => {
    expect(selfUpdateBlocker(installed)).toBeNull();
    expect(selfUpdateBlocker({ ...installed, platform: 'darwin' })).toBe('not Windows');
    expect(selfUpdateBlocker({ ...installed, packaged: false })).toBe('not a packaged build');
    expect(selfUpdateBlocker({ ...installed, windowsStore: true })).toBe('a Microsoft Store build');
    expect(selfUpdateBlocker({ ...installed, portable: true })).toBe('the portable build');
    expect(selfUpdateBlocker({ ...installed, keys: [] })).toBe('no update key in this build');
  });
});

describe('SignedManifestProvider', () => {
  const BASE = 'https://releases.example.test/download/v0.5.0/';
  const key = keyPair();

  /** A provider whose requests are answered from `files` by URL; misses answer null. */
  function provider(files: Record<string, string>, version = '0.5.0') {
    const requested: { url: string; headers: unknown }[] = [];
    const executor = {
      request: vi.fn(
        async (o: { protocol: string; hostname: string; path: string; headers?: unknown }) => {
          const url = `${o.protocol}//${o.hostname}${o.path}`;
          requested.push({ url, headers: o.headers });
          return files[url] ?? null;
        },
      ),
    };
    const p = new SignedManifestProvider(
      {
        provider: 'custom',
        updateProvider: SignedManifestProvider,
        baseUrl: BASE,
        version,
        keys: [key.x],
      },
      null,
      { executor: executor as never, platform: 'win32', isUseMultipleRangeRequest: true },
    );
    return { p, requested };
  }

  it('reads a signed manifest and resolves its installer inside the release', async () => {
    const { p, requested } = provider({
      [`${BASE}latest.yml`]: MANIFEST,
      [`${BASE}latest.yml.sig`]: signed(MANIFEST, key.privateKey),
    });
    // electron-updater would send a random install ID; the provider drops it.
    p.setRequestHeaders({ 'x-user-staging-id': 'abc' });
    const info = await p.getLatestVersion();
    expect(info.version).toBe('0.5.0');
    expect(requested.map((r) => r.url).sort()).toEqual([
      `${BASE}latest.yml`,
      `${BASE}latest.yml.sig`,
    ]);
    expect(JSON.stringify(requested.map((r) => r.headers))).not.toContain('staging');
    const files = p.resolveFiles(info);
    expect(files.map((f) => f.url.href)).toEqual([`${BASE}Trifold-Setup-0.5.0-win-x64.exe`]);
    expect(files[0]!.info.sha512).toBe('c2hhNTEy');
  });

  it('refuses a manifest without a signature, with a bad one, or for another version', async () => {
    await expect(
      provider({ [`${BASE}latest.yml`]: MANIFEST }).p.getLatestVersion(),
    ).rejects.toThrow('no signed update manifest');
    const tampered = MANIFEST.replace('c2hhNTEy\n    size', 'ZXZpbA==\n    size');
    await expect(
      provider({
        [`${BASE}latest.yml`]: tampered,
        [`${BASE}latest.yml.sig`]: signed(MANIFEST, key.privateKey),
      }).p.getLatestVersion(),
    ).rejects.toThrow('did not verify');
    await expect(
      provider(
        {
          [`${BASE}latest.yml`]: MANIFEST,
          [`${BASE}latest.yml.sig`]: signed(MANIFEST, key.privateKey),
        },
        '0.6.0',
      ).p.getLatestVersion(),
    ).rejects.toThrow('is for 0.5.0, not 0.6.0');
  });

  it('refuses installer addresses outside the release, even when signed', async () => {
    const elsewhere = MANIFEST.replaceAll(
      'Trifold-Setup-0.5.0-win-x64.exe',
      'https://elsewhere.example.test/Trifold-Setup-0.5.0-win-x64.exe',
    );
    const { p } = provider({
      [`${BASE}latest.yml`]: elsewhere,
      [`${BASE}latest.yml.sig`]: signed(elsewhere, key.privateKey),
    });
    const info = await p.getLatestVersion();
    expect(() => p.resolveFiles(info)).toThrow('points outside its release');
  });
});
