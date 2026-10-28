import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { prepareFontAssets } from './font-assets.mjs';

const revision = 'a'.repeat(40);
const bytes = Buffer.from('test data');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const asset = (path, role, directory) => ({ path, role, sha256, url: `https://raw.githubusercontent.com/google/fonts/${revision}/${directory}/${path}` });
const font = name => ({ family: name, license: 'OFL-1.1', revision, sourceDirectory: `ofl/${name.toLowerCase()}`,
  files: [asset(`${name}.ttf`, 'font', `ofl/${name.toLowerCase()}`), asset(`${name}-OFL.txt`, 'license', `ofl/${name.toLowerCase()}`)] });

test('prepares multiple pinned fallback fonts and requires a license for each', async () => {
  const root = mkdtempSync(join(tmpdir(), 'craft-fonts-'));
  try {
    const directory = join(root, 'upstream/font-assets');
    mkdirSync(directory, { recursive: true });
    const manifest = { schemaVersion: 2, fonts: [font('First'), font('Second')] };
    const save = () => writeFileSync(join(root, 'upstream/font-assets.json'), JSON.stringify(manifest));
    for (const entry of manifest.fonts.flatMap(item => item.files)) writeFileSync(join(directory, entry.path), bytes);
    save();
    assert.equal((await prepareFontAssets(root)).fonts.length, 2);
    manifest.fonts[1].files.pop(); save();
    await assert.rejects(prepareFontAssets(root), /license/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
