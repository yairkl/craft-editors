const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

const root = path.resolve(__dirname, '..');
const suite = process.argv[2];
if (!['integration', 'rendering', 'editing', 'office', 'theme'].includes(suite)) throw new Error('Choose integration, rendering, editing, office, or theme.');
// Each member is first run without the other extension, then together to catch ID collisions.
async function main() {
  for (const selected of [['spreadsheets'], ['pdf'], ['word'], ['powerpoint'], ['spreadsheets', 'pdf', 'word', 'powerpoint']]) {
    if (suite === 'theme' && selected.length === 1) continue;
    if (suite === 'office' && !selected.some(name => ['word', 'powerpoint'].includes(name))) continue;
    if (suite === 'rendering' && selected.length === 1 && !['spreadsheets', 'pdf'].includes(selected[0])) continue;
    if (suite === 'editing' && !selected.includes('spreadsheets')) continue;
    if (process.env.CRAFT_TEST_ONLY && !selected.includes(process.env.CRAFT_TEST_ONLY)) continue;
    const label = selected.join('-');
    await runTests({
      version: '1.102.0',
      ...(process.env.VSCODE_EXECUTABLE_PATH ? { vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH } : {}),
      extensionDevelopmentPath: selected.map(name => path.join(root, 'dist/development', name)),
      extensionTestsPath: path.join(root, `out/test/${suite}/index.js`),
      extensionTestsEnv: { CRAFT_TEST_ROOT: root, CRAFT_TEST_EXTENSIONS: selected.join(',') },
      launchArgs: ['--disable-extensions', '--skip-welcome', '--skip-release-notes',
        ...(suite !== 'integration' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--disable-gpu']),
        '--user-data-dir', path.join(root, `.vscode-test/${suite}-${label}-user-data`),
        '--extensions-dir', path.join(root, `.vscode-test/${suite}-${label}-extensions`)],
    });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
