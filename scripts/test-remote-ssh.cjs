// Opt-in real Remote SSH QA. Uses only a disposable container/profile/test key.
const { execFileSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { randomUUID } = require('node:crypto');
const { runTests, resolveCliArgsFromVSCodeExecutablePath } = require('@vscode/test-electron');
const root = resolve(__dirname, '..');
const executable = process.env.VSCODE_EXECUTABLE_PATH;
if (!executable) throw new Error('Set VSCODE_EXECUTABLE_PATH to an installed desktop VS Code executable. Run under xvfb-run on headless Linux.');
const scratch = mkdtempSync(join(tmpdir(), 'craft-ssh-'));
const id = randomUUID().slice(0, 8);
const name = `craft-ssh-${id}`;
const image = `craft-vscode-ssh-test:${id}`;
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
const output = (command, args) => run(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function main() {
  try {
    run('npm', ['run', 'compile']);
    const context = join(scratch, 'image'); mkdirSync(context);
    const key = join(scratch, 'key');
    run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
    copyFileSync(key + '.pub', join(context, 'authorized_keys'));
    copyFileSync(join(root, 'integration-tests/remote/Dockerfile'), join(context, 'Dockerfile'));
    run('docker', ['build', '-t', image, context]);
    run('docker', ['run', '-d', '--name', name, '-p', '127.0.0.1::22', image]);
    const port = output('docker', ['port', name, '22']).split(':').pop();
    const config = join(scratch, 'ssh-config'); const known = join(scratch, 'known-hosts');
    let hostKeys;
    for (let attempt = 0; attempt < 25; attempt++) {
      try { hostKeys = output('ssh-keyscan', ['-p', port, '127.0.0.1']); if (hostKeys) break; } catch { /* Wait for this new sshd to start. */ }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!hostKeys) throw new Error('The disposable SSH host did not start.');
    writeFileSync(known, hostKeys + '\n');
    writeFileSync(config, `Host ${name}\n HostName 127.0.0.1\n Port ${port}\n User crafttest\n IdentityFile ${key}\n IdentitiesOnly yes\n IdentityAgent none\n UserKnownHostsFile ${known}\n StrictHostKeyChecking yes\n BatchMode yes\n`);
    run('ssh', ['-F', config, name, 'true']);
    const user = join(scratch, 'client'); const extensions = join(scratch, 'extensions');
    mkdirSync(join(user, 'User'), { recursive: true }); mkdirSync(extensions);
    writeFileSync(join(user, 'User/settings.json'), JSON.stringify({
      'remote.SSH.configFile': config, 'remote.SSH.remotePlatform': { [name]: 'linux' },
      'remote.SSH.useLocalServer': false, 'remote.SSH.useExecServer': false,
      'remote.SSH.localServerDownload': 'always', 'security.workspace.trust.enabled': false,
      'window.restoreWindows': 'none', 'update.mode': 'none',
    }, null, 2));
    const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executable, { reuseMachineInstall: true });
    run(cli, [...cliArgs, '--user-data-dir', user, '--extensions-dir', extensions, '--install-extension', 'ms-vscode-remote.remote-ssh@0.128.0', '--force'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    run('docker', ['cp', join(root, 'dist/development') + '/.', `${name}:/home/crafttest/workspace/extensions`]);
    run('docker', ['cp', join(root, 'integration-tests/fixtures'), `${name}:/home/crafttest/workspace/fixtures`]);
    run('docker', ['cp', join(root, 'out/test/remote'), `${name}:/home/crafttest/workspace/remote-driver`]);
    run('docker', ['exec', name, 'chown', '-R', 'crafttest:crafttest', '/home/crafttest/workspace']);
    const base = `vscode-remote://ssh-remote+${name}/home/crafttest/workspace`;
    await runTests({ vscodeExecutablePath: executable,
      extensionDevelopmentPath: ['spreadsheets', 'word', 'powerpoint', 'pdf', 'vector'].map(app => `${base}/extensions/${app}`),
      extensionTestsPath: `${base}/remote-driver/index.js`,
      launchArgs: ['--remote', `ssh-remote+${name}`, '/home/crafttest/workspace', '--user-data-dir', user, '--extensions-dir', extensions,
        '--skip-welcome', '--skip-release-notes', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const artifacts = join(root, 'artifacts/remote'); mkdirSync(artifacts, { recursive: true });
    run('docker', ['cp', `${name}:/home/crafttest/workspace/remote-results.json`, join(artifacts, 'results.json')]);
    console.log('Real SSH lifecycle verification passed; artifacts/remote/results.json records results.');
  } finally {
    try { run('docker', ['rm', '-f', name]); } catch { /* Startup may have failed before container creation. */ }
    try { run('docker', ['image', 'rm', image]); } catch { /* Build may have failed. */ }
    rmSync(keyPath(), { force: true }); rmSync(keyPath() + '.pub', { force: true });
  }
}
function keyPath() { return join(scratch, 'key'); }
main().catch(error => { console.error(error); process.exitCode = 1; });
