import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import type { ProbeResult } from '../../src/host';
import { readProbeDocument } from '../../src/document';
import { assertIsolation, fixture, forFormat, selected } from '../environment';

interface ProbeApi { onDidProbe: vscode.Event<ProbeResult> }

export async function run(): Promise<void> {
  assertIsolation();
  const apis = new Map<'xlsx' | 'pdf' | 'docx' | 'pptx', ProbeApi>();
  for (const descriptor of selected) {
    const extension = vscode.extensions.getExtension<ProbeApi>(descriptor.id);
    assert.ok(extension, 'Selected extension must be installed');
    apis.set(descriptor.format, await extension.activate());
    const otherEngine = descriptor.format === 'xlsx' ? 'pdf' : 'grid';
    await assert.rejects(async () => vscode.workspace.fs.stat(vscode.Uri.joinPath(extension.extensionUri, 'media', 'engines', otherEngine, 'viewer_bg.wasm')));
  }
  const first = selected[0]!;

  // Verify workspace.fs rather than assuming uri.fsPath or local filesystem access.
  const memoryUri = vscode.Uri.parse(`craft-test:/remote/sample.${first.format}`);
  let writes = 0;
  const changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  let current = new Uint8Array([37, 80, 68, 70]);
  let reportedSize = current.byteLength;
  const fsProvider: vscode.FileSystemProvider = {
    onDidChangeFile: changes.event,
    watch: () => new vscode.Disposable(() => {}),
    stat: () => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: reportedSize }),
    readDirectory: () => [], readFile: () => current,
    createDirectory: () => { writes++; }, writeFile: () => { writes++; },
    delete: () => { writes++; }, rename: () => { writes++; },
  };
  const registration = vscode.workspace.registerFileSystemProvider('craft-test', fsProvider);
  const cancellation = new vscode.CancellationTokenSource();
  try {
    const doc = await readProbeDocument(memoryUri, cancellation.token);
    assert.equal(doc.uri.toString(), memoryUri.toString());
    assert.deepEqual(doc.bytes, current);
    await verifyWebview(apis.get(first.format)!, memoryUri, first.format);
    await assert.rejects(readProbeDocument(memoryUri, cancellation.token, first.format === 'xlsx' ? 'pdf' : 'xlsx'), /supports only/);
    reportedSize = 33 * 1024 * 1024;
    await assert.rejects(readProbeDocument(memoryUri, cancellation.token), /32 MiB/);
    reportedSize = 1;
    current = new Uint8Array(33 * 1024 * 1024);
    await assert.rejects(readProbeDocument(memoryUri, cancellation.token), /32 MiB/);
    cancellation.cancel();
    await assert.rejects(readProbeDocument(memoryUri, cancellation.token), vscode.CancellationError);
    assert.equal(writes, 0);
  } finally {
    cancellation.dispose(); registration.dispose(); changes.dispose();
  }

  for (const { format } of selected) {
    await verifyWebview(apis.get(format)!, fixture(`minimal.${format}`), format);
  }
}

async function verifyWebview(api: ProbeApi, uri: vscode.Uri, format: 'xlsx' | 'pdf' | 'docx' | 'pptx'): Promise<void> {
  const before = await vscode.workspace.fs.readFile(uri);
  const hashBefore = createHash('sha256').update(before).digest('hex');
  let subscription: vscode.Disposable | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = new Promise<ProbeResult>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`No ${format} webview receipt within 40 seconds`)), 40_000);
    subscription = api.onDidProbe(value => { if (value.format === format) resolve(value); });
  });
  // Attach rejection handling before opening so failures cannot leave an unhandled timer promise.
  void result.catch(() => {});
  try {
    await vscode.commands.executeCommand('vscode.openWith', uri, forFormat(format).probe);
    const receipt = await result;
    assert.equal(receipt.verified, true, `${format}: real webview must hash the transferred bytes`);
    assert.equal(receipt.byteLength, before.byteLength);
    const after = await vscode.workspace.fs.readFile(uri);
    assert.equal(createHash('sha256').update(after).digest('hex'), hashBefore);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    console.log(`Verified ${uri.scheme} ${format} host/webview transfer (${receipt.byteLength} bytes), source unchanged.`);
  } finally { clearTimeout(timer); subscription?.dispose(); }
}
