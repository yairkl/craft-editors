const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } = require('@vscode/test-electron');
const root = path.resolve(__dirname, '..');

async function main() {
  const executable = process.env.VSCODE_EXECUTABLE_PATH || await downloadAndUnzipVSCode('1.102.0');
  const driver = path.join(root, '.vscode-test/package-test-driver');
  mkdirSync(driver, { recursive: true });
  writeFileSync(path.join(driver, 'package.json'), JSON.stringify({
    name: 'craft-package-test-driver', publisher: 'craft-tests', version: '0.0.1',
    engines: { vscode: '^1.102.0' }, main: './index.js', activationEvents: ['*'],
  }));
  writeFileSync(path.join(driver, 'index.js'), 'exports.activate = () => {};\n');
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executable, { reuseMachineInstall: true });
  for (const names of [['spreadsheets'], ['pdf'], ['spreadsheets', 'pdf', 'suite']]) {
    const label = names.join('-');
    const profile = path.join(root, `.vscode-test/installed-${label}`);
    rmSync(profile, { recursive: true, force: true });
    const args = ['--user-data-dir', path.join(profile, 'user'), '--extensions-dir', path.join(profile, 'extensions')];
    // Install individual archives first: the development publisher is not on Marketplace.
    for (const name of names) {
      const manifest = JSON.parse(readFileSync(path.join(root, 'packages', name, 'package.json'), 'utf8'));
      execFileSync(cli, [...cliArgs, ...args, '--install-extension', path.join(root, 'dist/vsix', `${manifest.name}-${manifest.version}.vsix`), '--force'],
        { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit' });
    }
    await runTests({
      vscodeExecutablePath: executable,
      extensionDevelopmentPath: driver,
      extensionTestsPath: path.join(root, 'out/test/installed/index.js'),
      extensionTestsEnv: { CRAFT_TEST_ROOT: root, CRAFT_TEST_EXTENSIONS: names.filter(name => name !== 'suite').join(','), CRAFT_TEST_SUITE: String(names.includes('suite')) },
      launchArgs: [...args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--skip-welcome', '--skip-release-notes'],
    });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
