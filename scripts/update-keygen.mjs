#!/usr/bin/env node
// Makes an Ed25519 key pair for signing update manifests (ADR 0045, docs/RELEASING.md).
//
//   node scripts/update-keygen.mjs [path for the private key]
//
// The private key is written as PEM to the path given (default: trifold-update-signing-key.pem
// in your home folder), never inside the repo, and never over an existing file. Store it in a
// password manager, add it to GitHub as the Actions secret TRIFOLD_UPDATE_SIGNING_KEY, and
// delete the file. The public key is printed: paste it into UPDATE_PUBLIC_KEYS in
// apps/desktop/src/main/updateSignature.ts. Run it twice to make the current key and a spare.
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const target = resolve(process.argv[2] ?? join(homedir(), 'trifold-update-signing-key.pem'));

const inside = relative(repo, target);
if (!inside.startsWith('..') && !isAbsolute(inside)) {
  console.error(`update-keygen: refusing to write a private key inside the repo (${target}).`);
  process.exit(1);
}
if (existsSync(target)) {
  console.error(`update-keygen: ${target} already exists; choose another path.`);
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
writeFileSync(target, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
const x = publicKey.export({ format: 'jwk' }).x;

console.log(`Private key written to ${target}`);
console.log('');
console.log('Public key (add to UPDATE_PUBLIC_KEYS in apps/desktop/src/main/updateSignature.ts):');
console.log(`  '${x}',`);
console.log('');
console.log('Next: add the private key file contents as the GitHub Actions secret');
console.log(
  'TRIFOLD_UPDATE_SIGNING_KEY, keep a copy in your password manager, then delete the file.',
);
