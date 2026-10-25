import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, extensions } from './stage-extensions.mjs';
const directory = resolve(root, 'dist/vsix');
const files = Object.keys(extensions).map(name => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'packages', name, 'package.json'), 'utf8'));
  return `${manifest.name}-${manifest.version}.vsix`;
}).sort();
writeFileSync(resolve(directory, 'SHA256SUMS'), files.map(name =>
  `${createHash('sha256').update(readFileSync(resolve(directory, name))).digest('hex')}  ${name}\n`).join(''));
console.log('Recorded SHA-256 checksums for all release installers.');
