import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySource } from './upstream-patches.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'upstream/manifest.json'), 'utf8'));
const selected = process.argv.slice(2);
if (selected.some(id => !manifest.applications.some(app => app.id === id))) {
  throw new Error('Choose gridcraft, wordcraft, deckcraft, pdfcraft, vectorcraft, or no arguments for all.');
}
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
for (const app of manifest.applications) {
  if (selected.length && !selected.includes(app.id)) continue;
  if (!['gridcraft', 'pdfcraft', 'wordcraft', 'deckcraft', 'vectorcraft'].includes(app.id) ||
      app.repository !== `https://github.com/storytold/${app.id}` ||
      !/^[a-f0-9]{40}$/.test(app.revision)) throw new Error('Invalid source pin.');
  const directory = resolve(root, 'upstream/checkouts', app.id);
  if (existsSync(directory)) {
    // Refuse unrelated local changes; only the declared patch may be applied.
    verifySource(root, app);
  } else {
    mkdirSync(directory, { recursive: true });
    git(directory, ['init', '--quiet']);
    git(directory, ['remote', 'add', 'origin', app.repository]);
    git(directory, ['fetch', '--depth=1', 'origin', app.revision]);
    git(directory, ['checkout', '--detach', 'FETCH_HEAD']);
  }
  if (git(directory, ['rev-parse', 'HEAD']) !== app.revision || !existsSync(resolve(directory, 'Cargo.lock'))) {
    throw new Error(`${app.id}: source verification failed.`);
  }
  verifySource(root, app, { apply: true });
  console.log(`${app.id}: verified ${app.revision}`);
}
