import { createHash, randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { readProbeDocument } from './document';
import { MAX_DOCUMENT_BYTES, type DocumentFormat } from '../protocol/probe';
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
  constructor(readonly uri: vscode.Uri, public cache: Uint8Array, public diskBytes: Uint8Array, public diskDigest: string, readonly recovered: boolean, readonly format: DocumentFormat) {
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

export interface EditableDescriptor { format: 'xlsx' | 'csv' | 'docx' | 'pptx' | 'pdf' | 'svg' | 'vectorcraft'; engine: 'grid' | 'word' | 'deck' | 'pdf' | 'vector'; viewType: string; label: string; additionalFormats?: DocumentFormat[] }

export class EditingProvider implements vscode.CustomEditorProvider<EditableDocument>, vscode.Disposable {
  private readonly changes = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<EditableDocument>>();
  readonly onDidChangeCustomDocument = this.changes.event;
  private readonly renders = new vscode.EventEmitter<RenderResult>();
  readonly onDidRender = this.renders.event;
  private readonly panels = new Map<EditableDocument, vscode.WebviewPanel>();
  private readonly documents = new Map<string, EditableDocument>();
  constructor(private readonly context: vscode.ExtensionContext, private readonly descriptor: EditableDescriptor) {}

  async openCustomDocument(uri: vscode.Uri, context: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): Promise<EditableDocument> {
    const disk = await readProbeDocument(uri, token, this.descriptor.additionalFormats ? undefined : this.descriptor.format);
    if (disk.format !== this.descriptor.format && !this.descriptor.additionalFormats?.includes(disk.format)) throw new Error('Unsupported document format.');
    let cache = disk.bytes;
    let baseline = digest(disk.bytes);
    if (context.backupId) {
      const backup = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.parse(context.backupId))).toString('utf8')) as Record<string, unknown>;
      if (backup.version !== 1 || typeof backup.bytes !== 'string' || typeof backup.diskDigest !== 'string' || !/^[a-f0-9]{64}$/.test(backup.diskDigest)) throw new Error('This document backup is incompatible.');
      cache = bytes(Buffer.from(backup.bytes, 'base64'));
      baseline = backup.diskDigest;
    }
    cancelled(token);
    const doc = new EditableDocument(uri, cache, disk.bytes, baseline, Boolean(context.backupId), disk.format);
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
    this.panels.set(doc, panel);
    panel.webview.options = { enableScripts: true, localResourceRoots: [media] };
    const capture = this.context.extensionMode === vscode.ExtensionMode.Test;
    let ready = false;
    let rendered = false;
    const renderTimer = setTimeout(() => reportFailure(), 60_000);
    const reportFailure = (failure?: unknown): void => {
      if (rendered) return;
      rendered = true;
      const result: RenderResult = { format: doc.format, rendered: false, width: 0, height: 0, nonBackgroundPixels: 0, units: 0 };
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
        void panel.webview.postMessage({ type: 'render:open', version: 1, sessionId, format: doc.format, editable: true,
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
        const result: RenderResult = { format: doc.format, rendered: true, width, height, nonBackgroundPixels, units };
        if (capture && typeof m.screenshot === 'string' && m.screenshot.startsWith('data:image/png;base64,') && m.screenshot.length < 16_000_000) {
          result.screenshot = m.screenshot;
          result.readOnlyVerified = m.readOnlyVerified === true;
          result.navigationVerified = m.navigationVerified === true;
          result.resizeVerified = m.resizeVerified === true;
        }
        this.renders.fire(result);
      }
    });
    const cleanup = (): void => { clearTimeout(renderTimer); rpc.dispose(); listener.dispose(); if (doc.rpc === rpc) doc.rpc = undefined; if (this.panels.get(doc) === panel) this.panels.delete(doc); };
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
    if (doc.format === 'csv' && this.descriptor.engine === 'grid' && target.path.toLowerCase().endsWith('.xlsx')) return this.saveWorkbookCopy(doc, target, token);
    if (!target.path.toLowerCase().endsWith(`.${doc.format}`)) throw new Error(`Save As must use the ${doc.format.toUpperCase()} format.`);
    return this.write(doc, target, token);
  }
  private async serialize(doc: EditableDocument, format: DocumentFormat = doc.format): Promise<{ bytes: Uint8Array; token: number }> {
    try { return snapshot(await doc.request('serialize', { flush: true, format })); }
    catch (error) {
      // Cancellation defers autosave without a validation dialog or a false saved acknowledgment.
      if (error instanceof Error && ['DRAFT_PENDING', 'CSV_FEATURES'].includes(error.message)) throw new vscode.CancellationError();
      throw error;
    }
  }
  private write(doc: EditableDocument, target: vscode.Uri, token: vscode.CancellationToken): Promise<void> {
    return doc.enqueue(async () => {
      cancelled(token);
      const data = await this.serialize(doc);
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
      if (doc.token === data.token) {
        const cache = doc.format === 'csv' ? snapshot(await doc.request('serialize', { flush: false })) : data;
        if (cache.token === doc.token) doc.cache = cache.bytes;
      }
      // Only the snapshot actually written is acknowledged. Later edits stay dirty.
      await doc.request('ack', { token: data.token });
      doc.savedToken = data.token;
    });
  }
  revertCustomDocument(doc: EditableDocument, token: vscode.CancellationToken): Promise<void> {
    return doc.enqueue(async () => {
      const data = await readProbeDocument(doc.uri, token, doc.format); cancelled(token);
      if (doc.disposed) return;
      let revision: unknown = 0;
      if (doc.rpc) {
        try { revision = await doc.request('restore', { bytes: Uint8Array.from(data.bytes).buffer }); }
        catch (error) { if (doc.rpc && !doc.disposed) throw error; }
      }
      // VS Code can finish Revert after closing a Save As source panel. The
      // persisted cache still reverts; a future renderer starts at revision zero.
      if (doc.disposed) return;
      if (!integer(revision)) throw new Error('Invalid restored revision.');
      doc.cache = data.bytes; doc.diskBytes = data.bytes; doc.diskDigest = digest(data.bytes);
      doc.token = revision; doc.savedToken = revision;
    });
  }
  async backupCustomDocument(doc: EditableDocument, context: vscode.CustomDocumentBackupContext, token: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
    const data = await this.serialize(doc, doc.format === 'csv' ? 'xlsx' : doc.format); cancelled(token);
    const body = Buffer.from(JSON.stringify({ version: 1, diskDigest: doc.diskDigest, bytes: Buffer.from(data.bytes).toString('base64') }));
    await vscode.workspace.fs.writeFile(context.destination, body);
    if (data.token === doc.token) doc.cache = data.bytes;
    return { id: context.destination.toString(), delete: () => { void vscode.workspace.fs.delete(context.destination).then(() => {}, () => {}); } };
  }
  /** Export a CSV session as XLSX without acknowledging or overwriting its CSV source. */
  saveWorkbookCopy(doc: EditableDocument, target: vscode.Uri, token: vscode.CancellationToken): Promise<void> {
    if (doc.format !== 'csv' || this.descriptor.engine !== 'grid' || !target.path.toLowerCase().endsWith('.xlsx') || target.toString() === doc.uri.toString()) return Promise.reject(new Error('Choose an .xlsx destination for this CSV workbook.'));
    return doc.enqueue(async () => {
      cancelled(token);
      const data = await this.serialize(doc, 'xlsx');
      cancelled(token);
      await vscode.workspace.fs.writeFile(target, data.bytes);
      if (doc.token === data.token) doc.cache = data.bytes;
      // The copy is saved; rich edits in the CSV session still need an explicit
      // discard on closing. Export must never falsely acknowledge a CSV save.
    });
  }
  async saveCsvAsWorkbook(document?: EditableDocument): Promise<void> {
    const doc = document ?? [...this.panels].find(([item, panel]) => item.format === 'csv' && panel.active)?.[0];
    if (!doc || doc.format !== 'csv') { await vscode.window.showInformationMessage('Open a CSV file in Craft Spreadsheets first.'); return; }
    const target = await vscode.window.showSaveDialog({ defaultUri: doc.uri.with({ path: doc.uri.path.replace(/\.csv$/i, '.xlsx') }), filters: { 'Excel workbook': ['xlsx'] }, saveLabel: 'Save XLSX copy' });
    if (!target) return;
    const source = new vscode.CancellationTokenSource();
    try { await this.saveWorkbookCopy(doc, target, source.token); }
    finally { source.dispose(); }
    await vscode.commands.executeCommand('vscode.openWith', target, this.descriptor.viewType);
  }
  private async command(doc: EditableDocument, panel: vscode.WebviewPanel, command: string): Promise<void> {
    switch (command) {
      case 'file.saveCopyXlsx': await this.saveCsvAsWorkbook(doc); break;
      case 'file.save': await vscode.workspace.save(doc.uri); break;
      case 'file.saveAs': await vscode.workspace.saveAs(doc.uri); break;
      case 'file.revert': await vscode.commands.executeCommand('workbench.action.files.revert'); break;
      case 'file.open': await vscode.commands.executeCommand('workbench.action.files.openFile'); break;
      case 'file.new': {
        const target = await vscode.window.showSaveDialog({ filters: { [this.descriptor.label]: [this.descriptor.format] }, saveLabel: 'Create document' });
        if (!target) return;
        if (!target.path.toLowerCase().endsWith(`.${this.descriptor.format}`)) throw new Error(`New documents must use the ${this.descriptor.format.toUpperCase()} format.`);
        await vscode.workspace.fs.writeFile(target, bytes(await doc.request('new')));
        await vscode.commands.executeCommand('vscode.openWith', target, this.descriptor.viewType); break;
      }
      case 'edit.undo': panel.reveal(panel.viewColumn, true); await vscode.commands.executeCommand('undo'); break;
      case 'edit.redo': panel.reveal(panel.viewColumn, true); await vscode.commands.executeCommand('redo'); break;
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
  getDocuments(): readonly EditableDocument[] { return [...this.documents.values()]; }
  async agentHistory(doc: EditableDocument, redo: boolean, steps: number): Promise<void> {
    const panel = this.panels.get(doc);
    if (!panel) throw new Error('The workbook view is closed.');
    panel.reveal(panel.viewColumn, true);
    if (!panel.active) throw new Error('Activate this workbook before using agent undo or redo.');
    for (let step = 0; step < steps; step++) await vscode.commands.executeCommand(redo ? 'redo' : 'undo');
  }
  dispose(): void { this.changes.dispose(); this.renders.dispose(); for (const doc of this.documents.values()) doc.dispose(); }
}
