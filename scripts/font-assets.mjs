import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export async function prepareFontAssets(root, { download = false } = {}) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'upstream/font-assets.json'), 'utf8'));
  if (manifest.schemaVersion !== 2 || !Array.isArray(manifest.fonts) || !manifest.fonts.length) throw new Error('Invalid font manifest.');
  const directory = resolve(root, 'upstream/font-assets');
  mkdirSync(directory, { recursive: true });
  for (const font of manifest.fonts) {
    if (font.license !== 'OFL-1.1' || !/^[a-f0-9]{40}$/.test(font.revision) || !/^ofl\/[a-z0-9]+$/.test(font.sourceDirectory) || !Array.isArray(font.files)) throw new Error('Invalid font source pin.');
    if (!font.files.some(asset => asset.role === 'font') || !font.files.some(asset => asset.role === 'license')) throw new Error('Every font needs font data and a license.');
    for (const asset of font.files) {
      if (!['font', 'license'].includes(asset.role) || !/^[A-Za-z0-9.-]+$/.test(asset.path) || !/^[a-f0-9]{64}$/.test(asset.sha256) ||
        !asset.url.startsWith(`https://raw.githubusercontent.com/google/fonts/${font.revision}/${font.sourceDirectory}/`)) throw new Error('Invalid font asset.');
      const file = resolve(directory, asset.path);
      let bytes;
      if (existsSync(file)) bytes = readFileSync(file);
      else {
        if (!download) throw new Error('Run npm run upstream:fetch to prepare the pinned font assets.');
        const response = await fetch(asset.url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`Could not fetch font asset: HTTP ${response.status}`);
        bytes = Buffer.from(await response.arrayBuffer());
      }
      if (bytes.length > 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`Font asset hash mismatch: ${asset.path}`);
      if (!existsSync(file)) writeFileSync(file, bytes);
    }
  }
  return manifest;
}
