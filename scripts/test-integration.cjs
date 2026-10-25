const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

runTests({
  version: '1.102.0',
  ...(process.env.VSCODE_EXECUTABLE_PATH ? { vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH } : {}),
  extensionDevelopmentPath: path.resolve(__dirname, '..'),
  extensionTestsPath: path.resolve(__dirname, '../out/test/integration/index.js'),
  launchArgs: ['--disable-extensions', '--disable-gpu', '--skip-welcome', '--skip-release-notes',
    '--user-data-dir', path.resolve(__dirname, '../.vscode-test/user-data'),
    '--extensions-dir', path.resolve(__dirname, '../.vscode-test/extensions')],
}).catch(error => { console.error(error); process.exitCode = 1; });
