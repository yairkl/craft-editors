import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySource } from './upstream-patches.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'upstream/manifest.json'), 'utf8'));
if (process.env.CRAFT_FONTS_DIR) throw new Error('Optional external fonts are not pinned for this build. Unset CRAFT_FONTS_DIR.');
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: 'inherit' });
const output = (command, args, cwd = root) => execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
for (const app of manifest.applications) {
  verifySource(root, app, { apply: true });
}
if (output('wasm-bindgen', ['--version']) !== 'wasm-bindgen 0.2.129') {
  throw new Error('Install wasm-bindgen-cli 0.2.129 to match the adapter lockfile.');
}
run('cargo', ['+1.95.0', 'build', '--manifest-path', 'adapters/Cargo.toml', '--release', '--locked', '--target', 'wasm32-unknown-unknown']);
const artifacts = {};
for (const id of ['grid', 'pdf', 'word', 'deck']) {
  const directory = resolve(root, 'media/engines', id);
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  run('wasm-bindgen', ['--target', 'web', '--out-dir', directory, '--out-name', 'viewer',
    resolve(root, `adapters/target/wasm32-unknown-unknown/release/craft_${id}_viewer.wasm`)]);
  for (const name of readdirSync(directory, { recursive: true }).filter(name => /\.(js|wasm)$/.test(name))) {
    const bytes = readFileSync(resolve(directory, name));
    artifacts[`${id}/${name}`] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
}
writeFileSync(resolve(root, 'media/engines/build.json'), JSON.stringify({
  rust: output('rustc', ['+1.95.0', '--version']), wasmBindgen: '0.2.129',
  adapterLockSha256: createHash('sha256').update(readFileSync(resolve(root, 'adapters/Cargo.lock'))).digest('hex'),
  sources: Object.fromEntries(manifest.applications.map(app => [app.id, app.revision])), artifacts,
  patches: Object.fromEntries(manifest.applications.map(app => [app.id, app.patches ?? []])),
}, null, 2) + '\n');
console.log('Built renderer modules and recorded SHA-256 hashes in media/engines/build.json.');
