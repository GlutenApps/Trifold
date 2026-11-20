#!/usr/bin/env node
// Writes and signs the Windows update manifest (ADR 0045, docs/RELEASING.md).
//
//   node scripts/update-manifest.mjs [dist folder]
//
// Runs in release.yml after the installer is built and, once it is live, code-signed: it reads
// the final Trifold-Setup-<version>-win-x64.exe, writes latest.yml (version, file name, sha512,
// size) beside it, and signs latest.yml's exact bytes with the Ed25519 private key in the
// TRIFOLD_UPDATE_SIGNING_KEY environment variable (PEM), writing the base64 signature to
// latest.yml.sig. electron-builder's own latest.yml is not used: Authenticode signing changes
// the installer after electron-builder hashes it.
//
// It refuses to sign with a key the app does not trust (one whose public half is missing from
// UPDATE_PUBLIC_KEYS in updateSignature.ts), since every installed copy would refuse that
// update. With --unsigned it writes latest.yml only, for local tests of the manifest.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const unsigned = args.includes('--unsigned');
const dist = resolve(args.find((a) => !a.startsWith('--')) ?? join(repo, 'dist'));

const fail = (message) => {
  console.error(`update-manifest: ${message}`);
  process.exit(1);
};

const version = JSON.parse(readFileSync(join(repo, 'apps/desktop/package.json'), 'utf8')).version;
const installer = `Trifold-Setup-${version}-win-x64.exe`;
const installerPath = join(dist, installer);
if (!existsSync(installerPath)) fail(`${installerPath} not found; build the installer first.`);

const sha512 = await new Promise((done, reject) => {
  const hash = createHash('sha512');
  createReadStream(installerPath)
    .on('data', (chunk) => hash.update(chunk))
    .on('error', reject)
    .on('end', () => done(hash.digest('base64')));
});
const size = statSync(installerPath).size;

// The shape electron-updater reads for the NSIS target (files[] plus the older path/sha512).
const manifest = [
  `version: ${version}`,
  'files:',
  `  - url: ${installer}`,
  `    sha512: ${sha512}`,
  `    size: ${size}`,
  `path: ${installer}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  '',
].join('\n');
const manifestPath = join(dist, 'latest.yml');
writeFileSync(manifestPath, manifest);
console.log(`update-manifest: wrote ${manifestPath} for ${installer} (${size} bytes)`);

if (unsigned) {
  console.log(
    'update-manifest: --unsigned, so no latest.yml.sig; no installed copy will accept it.',
  );
  process.exit(0);
}

const pem = process.env.TRIFOLD_UPDATE_SIGNING_KEY;
if (!pem || !pem.trim()) {
  fail(
    'TRIFOLD_UPDATE_SIGNING_KEY is not set. Add the private key as a GitHub Actions secret ' +
      '(docs/RELEASING.md, "Update signing key"); without a signature no installed copy updates.',
  );
}

let privateKey;
try {
  privateKey = createPrivateKey(pem);
} catch (err) {
  fail(`TRIFOLD_UPDATE_SIGNING_KEY is not a PEM private key (${err.message}).`);
}
if (privateKey.asymmetricKeyType !== 'ed25519') fail('the signing key is not an Ed25519 key.');
const x = createPublicKey(privateKey).export({ format: 'jwk' }).x;

const trusted = readFileSync(join(repo, 'apps/desktop/src/main/updateSignature.ts'), 'utf8');
if (!trusted.includes(`'${x}'`)) {
  fail(
    `the signing key's public half (${x}) is not in UPDATE_PUBLIC_KEYS, so the app would refuse ` +
      'this update. Add it there in an earlier release, or sign with a key that is listed.',
  );
}

const data = readFileSync(manifestPath);
const signature = sign(null, data, privateKey);
if (!verify(null, data, createPublicKey(privateKey), signature))
  fail('the signature did not verify.');
writeFileSync(join(dist, 'latest.yml.sig'), `${signature.toString('base64')}\n`);
console.log(`update-manifest: signed latest.yml with key ${x}`);
