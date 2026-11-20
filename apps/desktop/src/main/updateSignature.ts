import { createPublicKey, verify } from 'node:crypto';

/**
 * The update manifest's signature (ADR 0045). The release workflow signs `latest.yml` with an
 * Ed25519 private key that lives only in a GitHub Actions secret and writes the signature next to
 * it as `latest.yml.sig` (base64). The app trusts a manifest only when one of the public keys
 * below verifies those exact bytes; the manifest carries the installer's sha512, which
 * electron-updater checks after the download, so a verified manifest pins the installer too.
 *
 * Each entry is the `x` member of an Ed25519 JWK (base64url of the 32-byte public key), as
 * `node scripts/update-keygen.mjs` prints it. Keep the current key first and a spare after it, so
 * a lost or leaked key can be retired by a release signed with the spare. With no key here, this
 * build never installs an update itself and offers the release page instead.
 */
export const UPDATE_PUBLIC_KEYS: readonly string[] = [
  // Current key (2026-11-19): its private half is the TRIFOLD_UPDATE_SIGNING_KEY Actions secret.
  'Abi1K5zlBDMGTPC0Pj3OvTZBfkF3FWbucIyIz0kGhkY',
  // Spare (2026-11-19): kept offline, used only to retire the current key.
  't3IRQEJYSs4PO82Jxxb6pQ7sz6uBnDYQ4AVjQUTkBSM',
];

/** The signature file published beside the manifest. */
export const SIGNATURE_SUFFIX = '.sig';

/** Whether `signature` (base64) is a valid Ed25519 signature of `manifest` by one of `keys`. */
export function verifyManifest(
  manifest: string,
  signature: string,
  keys: readonly string[] = UPDATE_PUBLIC_KEYS,
): boolean {
  const sig = Buffer.from(signature.trim(), 'base64');
  if (sig.length !== 64) return false;
  const data = Buffer.from(manifest, 'utf8');
  return keys.some((x) => {
    try {
      const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' });
      return verify(null, data, key, sig);
    } catch {
      return false;
    }
  });
}
