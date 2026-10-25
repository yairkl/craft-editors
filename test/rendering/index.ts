import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { RenderResult } from '../../src/rendering';

interface RenderingApi { onDidRender: vscode.Event<RenderResult> }

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<RenderingApi>('craft-vscode-dev.craft-vscode');
  assert.ok(extension);
  const api = await extension.activate();
  const artifacts = path.join(extension.extensionPath, 'artifacts', 'rendering');
  await mkdir(artifacts, { recursive: true });
  for (const name of ['minimal.xlsx', 'minimal.pdf', 'rendering.xlsx', 'rendering.pdf']) {
    const format = name.endsWith('xlsx') ? 'xlsx' : 'pdf';
    const uri = vscode.Uri.joinPath(extension.extensionUri, 'integration-tests', 'fixtures', name);
    const before = await vscode.workspace.fs.readFile(uri);
    const result = await openAndWait(api, uri, format);
    assert.equal(result.rendered, true, `${format}: renderer must report a completed frame; ${result.failure ?? ''}`);
    assert.ok(result.width >= 300 && result.height >= 200, 'Canvas must have useful dimensions');
    assert.ok(result.nonBackgroundPixels > 100, 'Rendered output must contain visible content');
    assert.equal(result.units, name.startsWith('minimal') ? 1 : 2);
    assert.equal(result.readOnlyVerified, true, 'Document mutation input must be blocked');
    assert.equal(result.navigationVerified, true, 'Sheet/page navigation must work');
    assert.equal(result.resizeVerified, true, 'Resize/zoom must work');
    assert.ok(result.screenshot, 'Test mode must capture real rendered pixels');
    await writeFile(path.join(artifacts, `${name}.png`), Buffer.from(result.screenshot.split(',')[1] ?? '', 'base64'));
    assert.deepEqual(await vscode.workspace.fs.readFile(uri), before, 'Rendering must not change the source');
    assert.equal(vscode.window.activeTextEditor?.document.isDirty ?? false, false);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    console.log(`Verified ${name}: ${result.width}x${result.height}, ${result.nonBackgroundPixels} content pixels; navigation and read-only checks passed.`);
  }

  // Invalid input must be surfaced as a failure, not a successful blank canvas.
  for (const format of ['xlsx', 'pdf'] as const) {
    const invalid = vscode.Uri.joinPath(extension.extensionUri, 'artifacts', 'rendering', `invalid.${format}`);
    await vscode.workspace.fs.writeFile(invalid, Buffer.from('not a document'));
    assert.equal((await openAndWait(api, invalid, format)).rendered, false);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }

  const remoteBytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(extension.extensionUri, 'integration-tests', 'fixtures', 'minimal.pdf'));
  const changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  let writes = 0;
  const registration = vscode.workspace.registerFileSystemProvider('craft-render-test', {
    onDidChangeFile: changes.event, watch: () => new vscode.Disposable(() => {}),
    stat: () => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: remoteBytes.byteLength }),
    readFile: () => remoteBytes, readDirectory: () => [],
    writeFile: () => { writes++; }, createDirectory: () => { writes++; },
    delete: () => { writes++; }, rename: () => { writes++; },
  });
  try {
    const result = await openAndWait(api, vscode.Uri.parse('craft-render-test:/remote/minimal.pdf'), 'pdf');
    assert.equal(result.rendered, true, 'Non-file URI must render');
    assert.ok(result.nonBackgroundPixels > 100);
    assert.equal(writes, 0);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  } finally { registration.dispose(); changes.dispose(); }
}

async function openAndWait(api: RenderingApi, uri: vscode.Uri, format: 'xlsx' | 'pdf'): Promise<RenderResult> {
  let listener: vscode.Disposable | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const receipt = new Promise<RenderResult>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out rendering ${format}`)), 75_000);
    listener = api.onDidRender(result => { if (result.format === format) resolve(result); });
  });
  void receipt.catch(() => {});
  try {
    await vscode.commands.executeCommand('vscode.openWith', uri, 'craft.preview');
    return await receipt;
  } finally { clearTimeout(timer); listener?.dispose(); }
}
