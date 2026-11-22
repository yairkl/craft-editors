import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { root } from './stage-extensions.mjs';

export function collectNotices(selected) {
  const metadata = JSON.parse(execFileSync('cargo', ['+1.95.0', 'metadata', '--manifest-path', 'adapters/Cargo.toml',
    '--locked', '--format-version', '1', '--filter-platform', 'wasm32-unknown-unknown'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  const packages = new Map(metadata.packages.map(p => [p.id, p]));
  const nodes = new Map(metadata.resolve.nodes.map(n => [n.id, n]));
  const supplements = JSON.parse(readFileSync(resolve(root, 'licenses/registry-supplements/manifest.json'), 'utf8'));
  const licenseChoices = JSON.parse(readFileSync(resolve(root, 'licenses/choices.json'), 'utf8'));
  for (const name of selected.filter(name => name !== 'suite')) {
    const crate = `craft-${{spreadsheets:'grid',pdf:'pdf',word:'word',powerpoint:'deck',vector:'vector'}[name]}-viewer`;
    const entry = metadata.packages.find(p => p.name === crate);
    if (!entry) throw new Error(`Missing crate ${crate}`);
    const reachable = new Set();
    visit(entry.id);
    const destination = resolve(root, 'dist/notices', name);
    rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });
    const inventory = [];
    const sourceRoots = new Set();
    const packageRoots = new Map();
    for (const id of [...reachable].sort()) {
      const pkg = packages.get(id);
      if (!Object.hasOwn(licenseChoices, pkg.license)) throw new Error(`Review new license expression for ${pkg.name}: ${pkg.license}`);
      const source = dirname(pkg.manifest_path);
      const key = `${pkg.name}-${pkg.version}-${createHash('sha256').update(pkg.source ?? pkg.repository ?? 'workspace').digest('hex').slice(0, 8)}`;
      const files = licenseFiles(source);
      if (pkg.source?.startsWith('git+') || !pkg.source) {
        try {
          const sourceRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: source, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
          sourceRoots.add(sourceRoot);
          packageRoots.set(key, sourceRoot);
        } catch { /* Dependencies without repository metadata retain their own notices. */ }
      }
      if (pkg.license_file) files.push(resolve(source, pkg.license_file));
      for (const file of new Set(files)) {
        const target = join(destination, key, relative(source, file));
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(file, target);
      }
      const notices = [...new Set(files.map(file => `${key}/${relative(source, file)}`))];
      const supplement = supplements.find(entry => entry.packages.includes(`${pkg.name}@${pkg.version}`));
      if (supplement && pkg.source === 'registry+https://github.com/rust-lang/crates.io-index') {
        const vcs = JSON.parse(readFileSync(join(source, '.cargo_vcs_info.json'), 'utf8'));
        if (vcs.git.sha1 !== supplement.revision) throw new Error(`Supplement source differs for ${pkg.name}`);
        for (const file of supplement.files) {
          const bytes = readFileSync(resolve(root, file.path));
          if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Supplement hash differs: ${file.path}`);
          const target = `supplements/${file.path.split('/').slice(2).join('/')}`;
          mkdirSync(dirname(join(destination, target)), { recursive: true });
          writeFileSync(join(destination, target), bytes);
          notices.push(target);
        }
      }
      const isMplRegistry = pkg.license === 'MPL-2.0' && pkg.source === 'registry+https://github.com/rust-lang/crates.io-index';
      if (isMplRegistry) {
        mkdirSync(join(destination, 'licenses'), { recursive: true });
        copyFileSync(resolve(root, 'licenses/MPL-2.0.txt'), join(destination, 'licenses/MPL-2.0.txt'));
        notices.push('licenses/MPL-2.0.txt');
      }
      inventory.push({ name: pkg.name, licenseChoice: licenseChoices[pkg.license], version: pkg.version, license: pkg.license, source: pkg.source,
        repository: pkg.repository, ...(pkg.source === 'registry+https://github.com/rust-lang/crates.io-index' ? { sourceArchive: `https://crates.io/api/v1/crates/${pkg.name}/${pkg.version}/download` } : {}), notices: notices.sort(),
        ...(supplement ? { noticeSources: supplement.files.map(file => ({ url: file.url, sha256: file.sha256 })) } : {}),
        sourceRoot: packageRoots.get(key) });
    }
    // Workspace license/NOTICE and font assets often live above a crate directory.
    for (const sourceRoot of [...sourceRoots].sort()) {
      const key = 'source-' + createHash('sha256').update(sourceRoot.split('/').pop()).digest('hex').slice(0, 12);
      const files = ['LICENSE', 'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE', 'ASSETS.md', 'ATTRIBUTION.md', 'ATTRIBUTION.toml']
        .map(name => join(sourceRoot, name)).filter(existsSync);
      const assets = join(sourceRoot, 'assets');
      if (existsSync(assets)) files.push(...licenseFiles(assets, sourceRoot));
      for (const file of new Set(files)) {
        const target = join(destination, key, relative(sourceRoot, file));
        mkdirSync(dirname(target), { recursive: true }); copyFileSync(file, target);
      }
      const rootNotices = [...new Set(files.map(file => `${key}/${relative(sourceRoot, file)}`))].sort();
      for (const dependency of inventory.filter(dependency => dependency.sourceRoot === sourceRoot)) {
        dependency.notices = [...new Set([...dependency.notices, ...rootNotices])].sort();
      }
    }
    for (const dependency of inventory) delete dependency.sourceRoot;
    const appId = { spreadsheets: 'gridcraft', pdf: 'pdfcraft', word: 'wordcraft', powerpoint: 'deckcraft', vector: 'vectorcraft' }[name];
    const manifest = JSON.parse(readFileSync(resolve(root, 'upstream/manifest.json'), 'utf8'));
    const app = manifest.applications.find(app => app.id === appId);
    const build = JSON.parse(readFileSync(resolve(root, 'media/engines/build.json'), 'utf8'));
    const engine = { spreadsheets: 'grid', pdf: 'pdf', word: 'word', powerpoint: 'deck', vector: 'vector' }[name];
    if (build.sources[appId] !== app.revision || JSON.stringify(build.patches[appId]) !== JSON.stringify(app.patches ?? []) ||
        build.adapterLockSha256 !== createHash('sha256').update(readFileSync(resolve(root, 'adapters/Cargo.lock'))).digest('hex')) {
      throw new Error(`${name}: renderer provenance differs; rebuild renderers before packaging.`);
    }
    const rendererArtifacts = Object.fromEntries(Object.entries(build.artifacts).filter(([path]) => path.startsWith(`${engine}/`)));
    for (const [path, artifact] of Object.entries(rendererArtifacts)) {
      if (createHash('sha256').update(readFileSync(resolve(root, 'media/engines', path))).digest('hex') !== artifact.sha256) throw new Error(`Renderer hash differs: ${path}`);
    }
    mkdirSync(join(destination, 'modifications'), { recursive: true });
    for (const patch of app.patches ?? []) copyFileSync(resolve(root, patch.path), join(destination, 'modifications', patch.path.split('/').pop()));
    writeFileSync(join(destination, 'provenance.json'), JSON.stringify({
      application: app.id, repository: app.repository, revision: app.revision,
      patches: app.patches ?? [],
      adapterLockSha256: build.adapterLockSha256, rendererArtifacts,
      integrationSource: 'https://github.com/yairkl/craft-editors',
      scope: 'Conservative Cargo dependency graph including build dependencies; not a linked-binary inventory.',
      missingNotices: inventory.filter(dependency => !dependency.notices.length).map(({ name, version, source, repository, sourceArchive }) => ({ name, version, source, repository, sourceArchive })),
    }, null, 2) + '\n');
    if (name !== 'suite') {
      const fonts = JSON.parse(readFileSync(resolve(root, 'upstream/font-assets.json'), 'utf8'));
      mkdirSync(join(destination, 'fonts'), { recursive: true });
      for (const font of fonts.fonts) for (const asset of font.files.filter(file => file.role === 'license')) {
        copyFileSync(resolve(root, 'upstream/font-assets', asset.path), join(destination, 'fonts', asset.path));
      }
      writeFileSync(join(destination, 'fonts/attribution.json'), JSON.stringify(fonts, null, 2) + '\n');
    }
    // Original source paths are not included in the distributable inventory.
    writeFileSync(join(destination, 'dependencies.json'), JSON.stringify(inventory, null, 2) + '\n');
    for (const app of [{ spreadsheets: 'gridcraft', pdf: 'pdfcraft', word: 'wordcraft', powerpoint: 'deckcraft', vector: 'vectorcraft' }[name]]) {
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
