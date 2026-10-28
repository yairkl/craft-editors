import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const extensions = {
  spreadsheets: { engine: 'grid', format: 'xlsx' },
  pdf: { engine: 'pdf', format: 'pdf' },
  word: { engine: 'word', format: 'docx' },
  powerpoint: { engine: 'deck', format: 'pptx' },
  vector: { engine: 'vector', format: 'svg' },
  suite: {},
};

export function stageExtensions({ development = false, allowMissingRenderers = false, selected = Object.keys(extensions) } = {}) {
  const staged = {};
  for (const name of selected) {
    if (!Object.hasOwn(extensions, name)) throw new Error(`Unknown extension: ${name}`);
    const destination = resolve(root, 'dist', development ? 'development' : 'extensions', name);
    // Only generated directories beneath this repository are replaced.
    rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });
    cpSync(resolve(root, 'packages', name), destination, { recursive: true });
    copyFileSync(resolve(root, 'LICENSE'), resolve(destination, 'LICENSE'));
    const manifest = JSON.parse(readFileSync(resolve(destination, 'package.json'), 'utf8'));
    const { engine } = extensions[name];
    if (engine) {
      for (const file of ['host', 'document', 'rendering', 'editing', 'rpc', 'file-limits', 'backup', 'byte-buffer', 'coalesced-task']) copy(`out/src/${file}.js`);
      if (name === 'spreadsheets' || name === 'word' || name === 'powerpoint' || name === 'vector' || name === 'pdf') {
        for (const file of ['mcp-files', 'mcp-transport', 'mcp-proxy', name === 'spreadsheets' ? 'mcp' : 'document-mcp']) copy(`out/src/${file}.js`);
      }
      copy(`out/src/entrypoints/${name}.js`);
      copy('out/protocol/probe.js');
      for (const file of ['probe.js', 'probe.css', 'viewer.js', 'viewer.css']) copy(`media/${file}`);
      if (development) { copy('media/rendering-checks.js'); copy('media/editing-checks.js'); }
      for (const file of ['viewer.js', 'viewer_bg.wasm']) {
        const source = resolve(root, 'media/engines', engine, file);
        if (!existsSync(source)) {
          if (!allowMissingRenderers) throw new Error(`${name}: run npm run renderers:build before packaging.`);
        } else copy(`media/engines/${engine}/${file}`);
      }
      const snippets = resolve(root, 'media/engines', engine, 'snippets');
      if (existsSync(snippets)) cpSync(snippets, resolve(destination, 'media/engines', engine, 'snippets'), { recursive: true });
      if (engine === 'grid' || engine === 'word' || engine === 'deck' || engine === 'vector' || engine === 'pdf') {
        const node = resolve(root, 'media/engines', engine, 'node');
        if (existsSync(node)) cpSync(node, resolve(destination, 'media/engines', engine, 'node'), { recursive: true });
        else if (!allowMissingRenderers) throw new Error(`${name}: rebuild the renderer with the MCP runtime.`);
      }
      const notices = resolve(root, 'dist/notices', name);
      if (existsSync(notices)) cpSync(notices, resolve(destination, 'notices'), { recursive: true });
    }
    staged[name] = { directory: destination, manifest };
    function copy(relative) {
      const target = resolve(destination, relative);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(resolve(root, relative), target);
    }
  }
  return staged;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  stageExtensions({ development: process.argv.includes('--development'), allowMissingRenderers: process.argv.includes('--allow-missing-renderers') });
}
