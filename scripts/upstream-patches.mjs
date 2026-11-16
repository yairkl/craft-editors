import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  // Apply to a temporary index to normalize offsets and blob IDs against this
  // revision, then compare the complete resulting diff to the working tree.
  const temp = mkdtempSync(join(tmpdir(), 'craft-patch-index-'));
  let expected;
  try {
    const options = { cwd, encoding: 'utf8', env: { ...process.env, GIT_INDEX_FILE: join(temp, 'index') } };
    execFileSync('git', ['read-tree', 'HEAD'], options);
    execFileSync('git', ['apply', '--cached', '-'], { ...options, input: bytes });
    expected = execFileSync('git', ['diff', '--cached', '--binary', '--full-index'], options).trim();
  } finally { rmSync(temp, { recursive: true, force: true }); }
  if (git(['diff', '--cached', '--name-only']) || git(['ls-files', '--others', '--exclude-standard']) ||
      git(['diff', '--binary', '--full-index']) !== expected) {
    throw new Error(`${app.id}: checkout must contain exactly its declared patch, with no other changes.`);
  }
}
