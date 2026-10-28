import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import type { ProbeResult } from '../../src/host';
import { readProbeDocument } from '../../src/document';
import { readAgentFile, writeNewCopy } from '../../src/mcp-files';
import { assertIsolation, fixture, forFormat, selected } from '../environment';

interface ProbeApi { onDidProbe: vscode.Event<ProbeResult> }

export async function run(): Promise<void> {
  assertIsolation();
  const apis = new Map<'xlsx' | 'pdf' | 'docx' | 'pptx' | 'svg', ProbeApi>();
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
  let reads = 0;
  const fsProvider: vscode.FileSystemProvider = {
    onDidChangeFile: changes.event,
    watch: () => new vscode.Disposable(() => {}),
    stat: () => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: reportedSize }),
    readDirectory: () => [], readFile: () => { reads++; return current; },
    createDirectory: () => { writes++; }, writeFile: () => { writes++; },
    delete: () => { writes++; }, rename: () => { writes++; },
  };
  const registration = vscode.workspace.registerFileSystemProvider('craft-test', fsProvider);
  const cancellation = new vscode.CancellationTokenSource();
  const settings = vscode.workspace.getConfiguration(`craft.${{ xlsx: 'spreadsheets', pdf: 'pdf', docx: 'word', pptx: 'powerpoint', svg: 'vector' }[first.format]}`);
  try {
    const doc = await readProbeDocument(memoryUri, cancellation.token);
    assert.equal(doc.uri.toString(), memoryUri.toString());
    assert.deepEqual(doc.bytes, current);
    await verifyWebview(apis.get(first.format)!, memoryUri, first.format);
    await assert.rejects(readProbeDocument(memoryUri, cancellation.token, first.format === 'xlsx' ? 'pdf' : 'xlsx'), /supports only/);
    reportedSize = 33 * 1024 * 1024;
    current = new Uint8Array(reportedSize);
    assert.equal((await readProbeDocument(memoryUri, cancellation.token)).bytes.length, reportedSize, 'The default permits files larger than 32 MiB');
    assert.equal((await readAgentFile(memoryUri)).length, reportedSize);
    await settings.update('maxFileSizeMiB', 32, vscode.ConfigurationTarget.Global);
    await assert.rejects(readProbeDocument(memoryUri, cancellation.token), /32 MiB/);
    const readsBeforeLarge = reads;
    await assert.rejects(readAgentFile(memoryUri), /32 MiB/);
    assert.equal(reads, readsBeforeLarge, 'Agent must reject a known-oversized file before reading it');
    reportedSize = 1;
    current = new Uint8Array(33 * 1024 * 1024);
    await assert.rejects(readProbeDocument(memoryUri, cancellation.token), /32 MiB/);
    await assert.rejects(readAgentFile(memoryUri), /32 MiB/, 'Agent must reject a file that grows after stat');
    cancellation.cancel();
    await assert.rejects(readProbeDocument(memoryUri, cancellation.token), vscode.CancellationError);
    assert.equal(writes, 0);
  } finally {
    await settings.update('maxFileSizeMiB', undefined, vscode.ConfigurationTarget.Global);
    cancellation.dispose(); registration.dispose(); changes.dispose();
  }

  // A remote provider must honor no-overwrite rename and clean up the staged copy.
  const files = new Map<string, Uint8Array>([['/existing.xlsx', Uint8Array.of(1)]]);
  let failWrite = false;
  const copyChanges = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  const copies = vscode.workspace.registerFileSystemProvider('craft-copy-test', {
    onDidChangeFile: copyChanges.event, watch: () => new vscode.Disposable(() => {}),
    stat: uri => { const value = files.get(uri.path); if (!value) throw vscode.FileSystemError.FileNotFound(uri); return { type: vscode.FileType.File, ctime: 0, mtime: 0, size: value.length }; },
    readDirectory: () => [], readFile: uri => { const value = files.get(uri.path); if (!value) throw vscode.FileSystemError.FileNotFound(uri); return value; },
    createDirectory: () => {}, writeFile: (uri, data) => { files.set(uri.path, Uint8Array.from(data)); if (failWrite) throw vscode.FileSystemError.NoPermissions(uri); },
    delete: uri => { if (!files.delete(uri.path)) throw vscode.FileSystemError.FileNotFound(uri); },
    rename: (from, to, options) => { const value = files.get(from.path); if (!value) throw vscode.FileSystemError.FileNotFound(from); if (files.has(to.path) && !options.overwrite) throw vscode.FileSystemError.FileExists(to); files.set(to.path, value); files.delete(from.path); },
  });
  try {
    await assert.rejects(writeNewCopy(vscode.Uri.parse('craft-copy-test:/existing.xlsx'), Uint8Array.of(2)));
    assert.deepEqual(files.get('/existing.xlsx'), Uint8Array.of(1));
    await writeNewCopy(vscode.Uri.parse('craft-copy-test:/new.xlsx'), Uint8Array.of(3));
    assert.deepEqual(files.get('/new.xlsx'), Uint8Array.of(3));
    failWrite = true;
    await assert.rejects(writeNewCopy(vscode.Uri.parse('craft-copy-test:/failed.xlsx'), Uint8Array.of(4)));
    assert.equal(files.size, 2, 'Temporary copies must be removed on success and failure');
  } finally { copies.dispose(); copyChanges.dispose(); }

  for (const { format } of selected) {
    await verifyWebview(apis.get(format)!, fixture(`minimal.${format}`), format);
  }
}

async function verifyWebview(api: ProbeApi, uri: vscode.Uri, format: 'xlsx' | 'pdf' | 'docx' | 'pptx' | 'svg'): Promise<void> {
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
