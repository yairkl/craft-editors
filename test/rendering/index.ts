import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { RenderResult } from '../../src/rendering';
import { assertIsolation, fixture, forFormat, root, selected } from '../environment';

interface RenderingApi { onDidRender: vscode.Event<RenderResult> }

export async function run(): Promise<void> {
  assertIsolation();
  const apis = new Map<'xlsx' | 'pdf', RenderingApi>();
  for (const descriptor of selected) {
    const extension = vscode.extensions.getExtension<RenderingApi>(descriptor.id);
    assert.ok(extension);
    apis.set(descriptor.format, await extension.activate());
    await assert.rejects(async () => vscode.workspace.fs.stat(vscode.Uri.joinPath(extension.extensionUri, 'media', 'engines', descriptor.format === 'xlsx' ? 'pdf' : 'grid', 'viewer_bg.wasm')));
  }
  const artifacts = path.join(root!, 'artifacts', 'rendering');
  await mkdir(artifacts, { recursive: true });
  for (const name of ['minimal.xlsx', 'minimal.pdf', 'rendering.xlsx', 'rendering-active.xlsx', 'rendering.pdf']) {
    const format = name.endsWith('xlsx') ? 'xlsx' : 'pdf';
    if (!apis.has(format)) continue;
    const api = apis.get(format)!;
    const uri = fixture(name);
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
  for (const { format } of selected) {
    const invalid = vscode.Uri.file(path.join(artifacts, `invalid.${format}`));
    await vscode.workspace.fs.writeFile(invalid, Buffer.from('not a document'));
    assert.equal((await openAndWait(apis.get(format)!, invalid, format)).rendered, false);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }

  const remoteFormat = selected[0]!.format;
  const remoteBytes = await vscode.workspace.fs.readFile(fixture(`minimal.${remoteFormat}`));
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
    const result = await openAndWait(apis.get(remoteFormat)!, vscode.Uri.parse(`craft-render-test:/remote/minimal.${remoteFormat}`), remoteFormat);
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
    await vscode.commands.executeCommand('vscode.open', uri);
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputCustom && input.viewType === forFormat(format).preview,
      'Opening a supported file normally must choose Craft Preview');
    return await receipt;
  } finally { clearTimeout(timer); listener?.dispose(); }
}
