import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { root } from './stage-extensions.mjs';

export function collectNotices(selected) {
  const metadata = JSON.parse(execFileSync('cargo', ['+1.95.0', 'metadata', '--manifest-path', 'adapters/Cargo.toml',
    '--locked', '--format-version', '1', '--filter-platform', 'wasm32-unknown-unknown'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  const packages = new Map(metadata.packages.map(p => [p.id, p]));
  const nodes = new Map(metadata.resolve.nodes.map(n => [n.id, n]));
  for (const name of selected.filter(name => name !== 'suite')) {
    const crate = name === 'spreadsheets' ? 'craft-grid-viewer' : 'craft-pdf-viewer';
    const entry = metadata.packages.find(p => p.name === crate);
    if (!entry) throw new Error(`Missing crate ${crate}`);
    const reachable = new Set();
    visit(entry.id);
    const destination = resolve(root, 'dist/notices', name);
    rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });
    const inventory = [];
    for (const id of [...reachable].sort()) {
      const pkg = packages.get(id);
      const source = dirname(pkg.manifest_path);
      const key = `${pkg.name}-${pkg.version}-${createHash('sha256').update(pkg.source ?? pkg.repository ?? 'workspace').digest('hex').slice(0, 8)}`;
      const files = licenseFiles(source);
      if (pkg.license_file) files.push(resolve(source, pkg.license_file));
      for (const file of new Set(files)) {
        const target = join(destination, key, relative(source, file));
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(file, target);
      }
      inventory.push({ name: pkg.name, version: pkg.version, license: pkg.license, source: pkg.source,
        repository: pkg.repository, notices: [...new Set(files.map(file => `${key}/${relative(source, file)}`))].sort() });
    }
    // Original source paths are not included in the distributable inventory.
    writeFileSync(join(destination, 'dependencies.json'), JSON.stringify(inventory, null, 2) + '\n');
    for (const app of name === 'spreadsheets' ? ['gridcraft'] : ['pdfcraft']) {
      for (const file of ['LICENSE-MIT', 'LICENSE-APACHE']) {
        copyFileSync(resolve(root, 'upstream/checkouts', app, file), join(destination, `${app}-${file}`));
      }
    }
    function visit(id) {
      if (reachable.has(id)) return;
      reachable.add(id);
      for (const dep of nodes.get(id)?.deps ?? []) {
        if (dep.dep_kinds.some(kind => kind.kind !== 'dev')) visit(dep.pkg);
      }
    }
  }
}

function licenseFiles(directory, base = directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'target', 'node_modules', 'tests', 'test', 'examples'].includes(entry.name)) continue;
    const file = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...licenseFiles(file, base));
    else if (entry.isFile() && (/^(licen[cs]e|notice|copying|ofl|ufl|copyright)([._-]|$)/i.test(entry.name) ||
        /[-_]license[._-]/i.test(entry.name) || (relative(base, directory).split('/').includes('fonts') && entry.name.endsWith('.txt')))) files.push(file);
  }
  return files;
}
