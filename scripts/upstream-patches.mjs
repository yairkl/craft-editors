import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  // Apply to a temporary index to normalize offsets and blob IDs against this
  // revision, then compare the complete resulting diff to the working tree.
  const temp = mkdtempSync(join(tmpdir(), 'craft-patch-index-'));
  let expected, actual;
  try {
    const options = name => ({ cwd, encoding: 'utf8', env: { ...process.env, GIT_INDEX_FILE: join(temp, name) } });
    const desired = options('desired');
    execFileSync('git', ['read-tree', 'HEAD'], desired);
    execFileSync('git', ['apply', '--cached', '-'], { ...desired, input: bytes });
    expected = execFileSync('git', ['diff', '--cached', '--binary', '--full-index'], desired).trim();
    const added = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=A', '-z'], desired).split('\0').filter(Boolean);
    const exists = path => {
      try { lstatSync(resolve(cwd, path)); return true; }
      catch (error) { if (error && error.code === 'ENOENT') return false; throw error; }
    };
    // A clean baseline is allowed before application, unless a patch-declared
    // addition already exists (it might be hidden by upstream's ignore rules).
    if (!git(['status', '--porcelain']) && !added.some(exists)) {
      if (!apply) return;
      for (const args of [['apply', '--check', '-'], ['apply', '-']]) {
        execFileSync('git', args, { cwd, input: bytes, stdio: ['pipe', 'pipe', 'pipe'] });
      }
    }

    // A separate index captures tracked edits and untracked files without changing
    // the checkout's own index. Declared new files must match the patch exactly.
    const working = options('working');
    execFileSync('git', ['read-tree', 'HEAD'], working);
    execFileSync('git', ['add', '-A'], working);
    // Include only patch-declared additions even if upstream ignores them.
    // Other ignored files remain outside the verification scope.
    const present = added.filter(exists);
    if (present.length) execFileSync('git', ['add', '-f', '--', ...present], working);
    actual = execFileSync('git', ['diff', '--cached', '--binary', '--full-index'], working).trim();
  } finally { rmSync(temp, { recursive: true, force: true }); }
  if (git(['diff', '--cached', '--name-only']) || actual !== expected) {
    throw new Error(`${app.id}: checkout must contain exactly its declared patch, with no other changes.`);
  }
}
