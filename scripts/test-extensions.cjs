const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

const root = path.resolve(__dirname, '..');
const suite = process.argv[2];
if (!['integration', 'rendering'].includes(suite)) throw new Error('Choose integration or rendering.');
// Each member is first run without the other extension, then together to catch ID collisions.
async function main() {
  for (const selected of [['spreadsheets'], ['pdf'], ['spreadsheets', 'pdf']]) {
    const label = selected.join('-');
    await runTests({
      version: '1.102.0',
      ...(process.env.VSCODE_EXECUTABLE_PATH ? { vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH } : {}),
      extensionDevelopmentPath: selected.map(name => path.join(root, 'dist/development', name)),
      extensionTestsPath: path.join(root, `out/test/${suite}/index.js`),
      extensionTestsEnv: { CRAFT_TEST_ROOT: root, CRAFT_TEST_EXTENSIONS: selected.join(',') },
      launchArgs: ['--disable-extensions', '--skip-welcome', '--skip-release-notes',
        ...(suite === 'rendering' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--disable-gpu']),
        '--user-data-dir', path.join(root, `.vscode-test/${suite}-${label}-user-data`),
        '--extensions-dir', path.join(root, `.vscode-test/${suite}-${label}-extensions`)],
    });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
