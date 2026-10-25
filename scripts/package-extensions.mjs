import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, extensions, stageExtensions } from './stage-extensions.mjs';
import { collectNotices } from './collect-notices.mjs';

const require = createRequire(import.meta.url);
const { createVSIX } = require('@vscode/vsce');
const selected = process.argv.slice(2);
if (selected.some(name => !Object.hasOwn(extensions, name))) throw new Error('Choose spreadsheets, pdf, suite, or no arguments for all.');
const names = selected.length ? selected : Object.keys(extensions);
if (names.some(name => name !== 'suite')) collectNotices(names);
const staged = stageExtensions({ selected: names });
mkdirSync(resolve(root, 'dist/vsix'), { recursive: true });
for (const [name, { directory, manifest }] of Object.entries(staged)) {
  await createVSIX({ cwd: directory, dependencies: false,
    packagePath: resolve(root, 'dist/vsix', `${manifest.name}-${manifest.version}.vsix`),
  });
  console.log(`Packaged ${name} independently.`);
}
