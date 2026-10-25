import { createHash, randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { readProbeDocument } from './document';
import { MAX_DOCUMENT_BYTES } from '../protocol/probe';
import { renderHtml, type RenderResult } from './rendering';
import { WebviewRpc } from './rpc';

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const cancelled = (token: vscode.CancellationToken): void => { if (token.isCancellationRequested) throw new vscode.CancellationError(); };
function bytes(value: unknown): Uint8Array {
  const result = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : undefined;
  if (!result || result.byteLength > MAX_DOCUMENT_BYTES) throw new Error('Invalid or oversized document data.');
  return result;
}
function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 0xffff_ffff; }
function snapshot(value: unknown): { bytes: Uint8Array; token: number } {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid document response.');
  const result = value as Record<string, unknown>;
  if (!integer(result.token)) throw new Error('Invalid document revision.');
  return { bytes: bytes(result.bytes), token: result.token };
}

export class EditableDocument implements vscode.CustomDocument {
  rpc: WebviewRpc | undefined;
  token = 0;
  savedToken = 0;
  disposed = false;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly disposables: vscode.Disposable[] = [];
  constructor(readonly uri: vscode.Uri, public cache: Uint8Array, public diskBytes: Uint8Array, public diskDigest: string, readonly recovered: boolean) {
    if (recovered) this.savedToken = -1;
  }
  get dirty(): boolean { return this.token !== this.savedToken; }
  request(operation: string, fields: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.rpc) return Promise.reject(new Error('Open the document view before performing this operation.'));
    return this.rpc.request(operation, fields);
  }
  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation, operation);
    this.tail = next.catch(() => {});
    return next;
  }
  add(disposable: vscode.Disposable): void { this.disposables.push(disposable); }
  dispose(): void { this.disposed = true; this.rpc?.dispose(); this.disposables.forEach(item => item.dispose()); }
}

export interface EditableDescriptor { format: 'xlsx' | 'docx' | 'pptx'; engine: 'grid' | 'word' | 'deck'; viewType: string; label: string }

export class EditingProvider implements vscode.CustomEditorProvider<EditableDocument>, vscode.Disposable {
  private readonly changes = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<EditableDocument>>();
  readonly onDidChangeCustomDocument = this.changes.event;
  private readonly renders = new vscode.EventEmitter<RenderResult>();
  readonly onDidRender = this.renders.event;
  private readonly documents = new Map<string, EditableDocument>();
  constructor(private readonly context: vscode.ExtensionContext, private readonly descriptor: EditableDescriptor) {}

  async openCustomDocument(uri: vscode.Uri, context: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): Promise<EditableDocument> {
    const disk = await readProbeDocument(uri, token, this.descriptor.format);
    let cache = disk.bytes;
    let baseline = digest(disk.bytes);
    if (context.backupId) {
      const backup = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.parse(context.backupId))).toString('utf8')) as Record<string, unknown>;
      if (backup.version !== 1 || typeof backup.bytes !== 'string' || typeof backup.diskDigest !== 'string' || !/^[a-f0-9]{64}$/.test(backup.diskDigest)) throw new Error('This document backup is incompatible.');
      cache = bytes(Buffer.from(backup.bytes, 'base64'));
      baseline = backup.diskDigest;
    }
    cancelled(token);
    const doc = new EditableDocument(uri, cache, disk.bytes, baseline, Boolean(context.backupId));
    this.documents.set(uri.toString(), doc);
    doc.add(new vscode.Disposable(() => this.documents.delete(uri.toString())));
    return doc;
  }

  async resolveCustomEditor(doc: EditableDocument, panel: vscode.WebviewPanel, token: vscode.CancellationToken): Promise<void> {
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    const engine = vscode.Uri.joinPath(media, 'engines', this.descriptor.engine);
    await vscode.workspace.fs.stat(vscode.Uri.joinPath(engine, 'viewer_bg.wasm'));
    cancelled(token);
    const sessionId = randomUUID();
    const rpc = new WebviewRpc(sessionId, value => panel.webview.postMessage(value));
    doc.rpc?.dispose(); doc.rpc = rpc;
    panel.webview.options = { enableScripts: true, localResourceRoots: [media] };
    const capture = this.context.extensionMode === vscode.ExtensionMode.Test;
    let ready = false;
    let rendered = false;
    const renderTimer = setTimeout(() => reportFailure(), 60_000);
    const reportFailure = (failure?: unknown): void => {
      if (rendered) return;
      rendered = true;
      const result: RenderResult = { format: this.descriptor.format, rendered: false, width: 0, height: 0, nonBackgroundPixels: 0, units: 0 };
      if (capture && typeof failure === 'string') result.failure = failure.slice(0, 500);
      this.renders.fire(result);
    };
    const listener = panel.webview.onDidReceiveMessage((value: unknown) => {
      if (typeof value !== 'object' || value === null) return;
      const m = value as Record<string, unknown>;
      if (m.sessionId !== sessionId || m.version !== 1) return;
      if (rpc.accept(m)) return;
      if (m.type === 'render:ready' && !ready) {
        ready = true;
        void panel.webview.postMessage({ type: 'render:open', version: 1, sessionId, format: this.descriptor.format, editable: true,
          bytes: Uint8Array.from(doc.cache).buffer, originalBytes: Uint8Array.from(doc.diskBytes).buffer,
          recovered: doc.dirty, capture });
      } else if (m.type === 'editor:changed' && ready && integer(m.before) && integer(m.after) && m.before !== m.after) {
        const before = m.before, after = m.after;
        doc.token = after;
        this.changes.fire({ document: doc, label: typeof m.label === 'string' ? m.label.slice(0, 100) : 'Edit document',
          undo: () => this.history(doc, before), redo: () => this.history(doc, after) });
        // Retain the latest committed model for webview reconstruction; only the
        // WASM engine edits the model. This is not a second editable model.
        void doc.request('serialize', { flush: false }).then(value => {
          const cached = snapshot(value);
          if (!doc.disposed && cached.token === doc.token) doc.cache = cached.bytes;
        }).catch(() => {});
      } else if (m.type === 'editor:command' && typeof m.command === 'string') {
        void this.command(doc, panel, m.command).catch(error => vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Document operation failed.'));
      } else if (m.type === 'render:failed') {
        clearTimeout(renderTimer); reportFailure(m.failure);
      } else if (m.type === 'render:result' && !rendered) {
        const { width, height, nonBackgroundPixels, units } = m;
        if (![width, height, nonBackgroundPixels, units].every(integer) || typeof width !== 'number' || typeof height !== 'number' || typeof nonBackgroundPixels !== 'number' || typeof units !== 'number' || width < 1 || height < 1 || width * height > 16_000_000 || nonBackgroundPixels > width * height || units < 1) return;
        rendered = true; clearTimeout(renderTimer);
        const result: RenderResult = { format: this.descriptor.format, rendered: true, width, height, nonBackgroundPixels, units };
        if (capture && typeof m.screenshot === 'string' && m.screenshot.startsWith('data:image/png;base64,') && m.screenshot.length < 16_000_000) {
          result.screenshot = m.screenshot;
          result.readOnlyVerified = m.readOnlyVerified === true;
          result.navigationVerified = m.navigationVerified === true;
          result.resizeVerified = m.resizeVerified === true;
        }
        this.renders.fire(result);
      }
    });
    const cleanup = (): void => { clearTimeout(renderTimer); rpc.dispose(); listener.dispose(); if (doc.rpc === rpc) doc.rpc = undefined; };
    doc.add(token.onCancellationRequested(cleanup));
    panel.onDidDispose(cleanup);
    panel.webview.html = renderHtml(panel.webview, media, engine, sessionId, true);
  }

  private async history(doc: EditableDocument, target: number): Promise<void> {
    await doc.request('history', { token: target }); doc.token = target;
    const cached = snapshot(await doc.request('serialize', { flush: false }));
    if (cached.token === doc.token) doc.cache = cached.bytes;
  }
  async saveCustomDocument(doc: EditableDocument, token: vscode.CancellationToken): Promise<void> {
    return this.write(doc, doc.uri, token);
  }
  async saveCustomDocumentAs(doc: EditableDocument, target: vscode.Uri, token: vscode.CancellationToken): Promise<void> {
    if (!target.path.toLowerCase().endsWith(`.${this.descriptor.format}`)) throw new Error(`Save As must use the ${this.descriptor.format.toUpperCase()} format.`);
    return this.write(doc, target, token);
  }
  private write(doc: EditableDocument, target: vscode.Uri, token: vscode.CancellationToken): Promise<void> {
    return doc.enqueue(async () => {
      cancelled(token);
      const data = snapshot(await doc.request('serialize', { flush: true }));
      cancelled(token);
      if (target.toString() === doc.uri.toString()) {
        const disk = await vscode.workspace.fs.readFile(doc.uri);
        if (digest(disk) !== doc.diskDigest) throw new Error('This document changed on disk. Use Save As to preserve your edits, or Revert to reload the file.');
      }
      cancelled(token);
      await vscode.workspace.fs.writeFile(target, data.bytes);
      if (target.toString() === doc.uri.toString()) {
        doc.diskBytes = data.bytes; doc.diskDigest = digest(data.bytes);
      }
      if (doc.token === data.token) doc.cache = data.bytes;
      // Only the snapshot actually written is acknowledged. Later edits stay dirty.
      await doc.request('ack', { token: data.token });
      doc.savedToken = data.token;
    });
  }
  revertCustomDocument(doc: EditableDocument, token: vscode.CancellationToken): Promise<void> {
    return doc.enqueue(async () => {
      const data = await readProbeDocument(doc.uri, token, this.descriptor.format); cancelled(token);
      const revision = await doc.request('restore', { bytes: Uint8Array.from(data.bytes).buffer });
      if (!integer(revision)) throw new Error('Invalid restored revision.');
      doc.cache = data.bytes; doc.diskBytes = data.bytes; doc.diskDigest = digest(data.bytes);
      doc.token = revision; doc.savedToken = revision;
    });
  }
  async backupCustomDocument(doc: EditableDocument, context: vscode.CustomDocumentBackupContext, token: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
    const data = snapshot(await doc.request('serialize', { flush: true })); cancelled(token);
    const body = Buffer.from(JSON.stringify({ version: 1, diskDigest: doc.diskDigest, bytes: Buffer.from(data.bytes).toString('base64') }));
    await vscode.workspace.fs.writeFile(context.destination, body);
    if (data.token === doc.token) doc.cache = data.bytes;
    return { id: context.destination.toString(), delete: () => { void vscode.workspace.fs.delete(context.destination).then(() => {}, () => {}); } };
  }
  private async command(doc: EditableDocument, panel: vscode.WebviewPanel, command: string): Promise<void> {
    switch (command) {
      case 'file.save': await vscode.workspace.save(doc.uri); break;
      case 'file.saveAs': await vscode.workspace.saveAs(doc.uri); break;
      case 'file.open': await vscode.commands.executeCommand('workbench.action.files.openFile'); break;
      case 'file.new': {
        const target = await vscode.window.showSaveDialog({ filters: { [this.descriptor.label]: [this.descriptor.format] }, saveLabel: 'Create document' });
        if (!target) return;
        if (!target.path.toLowerCase().endsWith(`.${this.descriptor.format}`)) throw new Error(`New documents must use the ${this.descriptor.format.toUpperCase()} format.`);
        await vscode.workspace.fs.writeFile(target, bytes(await doc.request('new')));
        await vscode.commands.executeCommand('vscode.openWith', target, this.descriptor.viewType); break;
      }
      case 'edit.undo': panel.reveal(); await vscode.commands.executeCommand('undo'); break;
      case 'edit.redo': panel.reveal(); await vscode.commands.executeCommand('redo'); break;
      case 'file.close': case 'app.quit': panel.reveal(); await vscode.commands.executeCommand('workbench.action.closeActiveEditor'); break;
      case 'view.newWindow': panel.reveal(); await vscode.commands.executeCommand('workbench.action.splitEditor'); break;
    }
  }
  createRecoveryTestPanel(): vscode.WebviewPanel {
    if (this.context.extensionMode !== vscode.ExtensionMode.Test) throw new Error('Test operation unavailable.');
    return vscode.window.createWebviewPanel('craft.recovery.test', 'Recovered test document', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
  }
  /** Integration tests use the same provider methods that VS Code calls. */
  getDocument(uri: vscode.Uri): EditableDocument | undefined { return this.documents.get(uri.toString()); }
  dispose(): void { this.changes.dispose(); this.renders.dispose(); for (const doc of this.documents.values()) doc.dispose(); }
}
