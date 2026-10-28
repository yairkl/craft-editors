import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function verifySource(root, app, { apply = false } = {}) {
  const cwd = resolve(root, 'upstream/checkouts', app.id);
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  if (git(['rev-parse', 'HEAD']) !== app.revision) throw new Error(`${app.id}: wrong source revision.`);
  const patches = app.patches ?? [];
  if (!patches.length) {
    if (git(['status', '--porcelain'])) throw new Error(`${app.id}: source must be clean.`);
    return;
  }
  const parts = patches.map(patch => {
    const file = resolve(root, patch.path);
    if (!file.startsWith(resolve(root, 'upstream/patches') + '/')) throw new Error('Invalid patch path.');
    const bytes = readFileSync(file);
    if (createHash('sha256').update(bytes).digest('hex') !== patch.sha256) throw new Error(`${app.id}: patch hash differs from manifest.`);
    return bytes;
  });
  const bytes = Buffer.concat(parts);
  if (!git(['status', '--porcelain'])) {
    if (!apply) return;
    for (const args of [['apply', '--check', '-'], ['apply', '-']]) {
      execFileSync('git', args, { cwd, input: bytes, stdio: ['pipe', 'pipe', 'pipe'] });
    }
  }
  if (git(['diff', '--cached', '--name-only']) || git(['ls-files', '--others', '--exclude-standard']) ||
      git(['diff', '--binary', '--full-index']) !== bytes.toString('utf8').trim()) {
    throw new Error(`${app.id}: checkout must contain exactly its declared patch, with no other changes.`);
  }
}
