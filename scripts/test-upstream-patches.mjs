import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { verifySource } from './upstream-patches.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
test('verifies and applies an ordered patch set without accepting unrelated changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'craft-patches-'));
  const checkout = join(root, 'upstream/checkouts/testapp');
  try {
    mkdirSync(checkout, { recursive: true }); mkdirSync(join(root, 'upstream/patches'), { recursive: true });
    const git = (...args) => execFileSync('git', args, { cwd: checkout, encoding: 'utf8' }).trim();
    git('init', '-q');
    writeFileSync(join(checkout, 'one'), 'before one\n'); writeFileSync(join(checkout, 'two'), 'before two\n');
    git('add', 'one', 'two'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture');
    const revision = git('rev-parse', 'HEAD');
    writeFileSync(join(checkout, 'one'), 'after one\n'); writeFileSync(join(checkout, 'two'), 'after two\n');
    const diff = git('diff', '--binary', '--full-index');
    const parts = diff.split(/(?=diff --git )/).filter(Boolean).map(part => Buffer.from(part.trimEnd() + '\n'));
    assert.equal(parts.length, 2);
    const patches = parts.map((bytes, i) => { const path = `upstream/patches/${i}.patch`; writeFileSync(join(root, path), bytes); return { path, sha256: hash(bytes) }; });
    const app = { id: 'testapp', revision, patches };
    verifySource(root, app);
    git('checkout', '--', 'one', 'two');
    verifySource(root, app, { apply: true });
    assert.equal(readFileSync(join(checkout, 'one'), 'utf8'), 'after one\n');
    writeFileSync(join(checkout, 'unrelated'), 'unexpected');
    assert.throws(() => verifySource(root, app), /exactly/);
    rmSync(join(checkout, 'unrelated'));
    writeFileSync(join(root, patches[1].path), 'tampered');
    assert.throws(() => verifySource(root, app), /hash differs/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
