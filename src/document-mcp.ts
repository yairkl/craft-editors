import { createHash } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { EditableDocument, EditingProvider } from './editing';
import { registerAgentServer } from './mcp-transport';
import { findLive, hasDirtyText, readAgentFile, sameResource, writeNewCopy } from './mcp-files';

interface Headless { message(input: string): string | undefined; open_bytes(input: Uint8Array, format?: string): number | undefined | void; save_bytes(format?: string): Uint8Array; mark_saved?(input: Uint8Array): void; free(): void }
interface Message { id?: string | number; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } }
interface App { formats: string[]; open: string; save: string; create: string; execute: string; readonly: string[]; allowed?: string[]; pdf?: boolean }
const hash = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');
const result = (id: unknown, text: string, error = false): string => JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: error } });
const pdfTools = ['doc_open', 'doc_list', 'doc_info', 'doc_save', 'doc_set_info', 'page_render', 'text_extract', 'text_find', 'text_word_count', 'page_rotate', 'page_delete', 'page_move', 'page_reverse', 'page_insert_blank', 'page_duplicate', 'edit_undo', 'edit_redo', 'doc_inspect', 'render_preview', 'bookmark_rename', 'bookmark_delete', 'bookmark_move', 'bookmark_set_page', 'link_list', 'link_add', 'link_edit', 'link_delete', 'comment_list', 'comment_reply', 'comment_set_status', 'comment_mark', 'comment_lock', 'comment_edit', 'comment_delete', 'form_fields', 'form_reset', 'form_tab_order', 'doc_initial_view', 'text_lines', 'text_paragraphs', 'text_edit', 'text_edit_layout'];

class DocumentSession {
  private uri: vscode.Uri | undefined;
  private baseline = '';
  private mode: 'none' | 'live' | 'headless' = 'none';
  private changed = false;
  private pdfId: number | undefined;
  constructor(private readonly backend: Headless, private readonly provider: EditingProvider, private readonly app: App) {}
  dispose(): void { this.backend.free(); }
  private uriFor(value: unknown): vscode.Uri {
    if (typeof value !== 'string' || !value) throw new Error('Provide a document path or URI.');
    const uri = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value) ? vscode.Uri.parse(value) : path.isAbsolute(value) ? vscode.Uri.file(value) : vscode.workspace.workspaceFolders?.[0] && vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, value);
    if (!uri || !this.app.formats.some(format => uri.path.toLowerCase().endsWith(`.${format}`))) throw new Error(`Choose a ${this.app.formats.join(' or ').toUpperCase()} document. Relative paths require an open workspace.`);
    return uri;
  }
  private async live(): Promise<EditableDocument | undefined> { return this.uri ? findLive(this.provider, this.uri) : undefined; }
  private async checkMode(): Promise<EditableDocument | undefined> {
    const live = await this.live();
    if (this.mode === 'live' && !live) throw new Error('The document view was closed. Open the document again before continuing.');
    if (this.mode === 'headless' && live) {
      if (this.app.pdf) throw new Error('The PDF was opened in an editor. Reopen it through doc_open to refresh its document id.');
      if (this.changed) throw new Error('The document was opened while this agent has unsaved changes. Save them to another path.');
      this.uri = live.uri; this.mode = 'live';
    }
    return live;
  }
  private async open(request: Message, args: Record<string, unknown>): Promise<string> {
    if (this.changed) throw new Error('Save the current headless document before opening another.');
    if (args.password) throw new Error('Password-protected documents are not supported by this integration.');
    const uri = this.uriFor(args.path);
    if (await hasDirtyText(uri)) throw new Error('This file has unsaved changes in a text editor. Save or close that editor first.');
    const live = await findLive(this.provider, uri);
    if (live) {
      this.uri = live.uri; this.mode = 'live';
      if (this.app.pdf) {
        const id = await live.request('agent:document-id');
        if (typeof id !== 'number' || !Number.isSafeInteger(id)) throw new Error('Invalid PDF document id.');
        this.pdfId = id;
        return this.pdfSummary(request.id, live);
      }
      return result(request.id, 'Opened the live document, including unsaved edits.');
    }
    const data = await readAgentFile(uri);
    if (await findLive(this.provider, uri) || await hasDirtyText(uri)) throw new Error('The document was opened or modified during loading; retry the request.');
    const id = this.backend.open_bytes(data, path.extname(uri.path).slice(1).toLowerCase());
    this.uri = uri; this.baseline = hash(data); this.mode = 'headless'; this.changed = false;
    if (this.app.pdf) {
      if (typeof id !== 'number' || !Number.isSafeInteger(id)) throw new Error('Invalid PDF document id.');
      this.pdfId = id;
      return this.pdfSummary(request.id);
    }
    return result(request.id, 'Opened the document in a headless session.');
  }
  private async pdfSummary(id: unknown, live?: EditableDocument): Promise<string> {
    const message = JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/call', params: { name: 'doc_info', arguments: { doc: this.pdfId } } });
    const raw = live ? await live.request('agent:mcp', { message }) as string | undefined : this.backend.message(message);
    if (!raw) throw new Error('PDF did not respond.');
    const response = JSON.parse(raw) as { result?: { isError?: boolean; content?: { text?: string }[] } };
    if (!response.result || response.result.isError) throw new Error(response.result?.content?.[0]?.text ?? 'PDF inspection failed.');
    const info = JSON.parse(response.result?.content?.[0]?.text ?? '{}') as { document?: unknown };
    return result(id, JSON.stringify(info.document ?? { doc: this.pdfId }));
  }
  private async checkHistory(live: EditableDocument): Promise<void> {
    const name = this.app.pdf ? 'doc_info' : 'inspect_document';
    const args = this.app.pdf ? { doc: this.pdfId } : {};
    const message = JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/call', params: { name, arguments: args } });
    const raw = await live.request('agent:mcp', { message });
    if (typeof raw !== 'string') throw new Error('Document inspection failed.');
    const response = JSON.parse(raw) as { result?: { isError?: boolean; content?: { text?: string }[] }; error?: { message?: string } };
    if (response.error || !response.result || response.result.isError) throw new Error(response.result?.content?.[0]?.text ?? response.error?.message ?? 'Finish the active edit before using agent history.');
  }
  private async save(request: Message, args: Record<string, unknown>): Promise<string> {
    if (!this.uri) throw new Error('Open a document before saving.');
    if (this.app.pdf && (args.doc !== this.pdfId || Object.keys(args).some(key => key !== 'doc' && key !== 'path'))) throw new Error('Use the current PDF document id and omit unsupported save options.');
    const target = args.path ? this.uriFor(args.path) : this.uri;
    if (await hasDirtyText(this.uri) || await hasDirtyText(target)) throw new Error('This file has unsaved changes in a text editor. Save or close that editor first.');
    if (path.extname(target.path).toLowerCase() !== path.extname(this.uri.path).toLowerCase()) throw new Error('Save As must keep the original format.');
    if (this.app.formats.includes('svg') && Object.keys(args).some(key => key !== 'path')) throw new Error('Vector save options are not supported by this editor integration.');
    const sameTarget = await sameResource(target, this.uri);
    const currentView = await this.live();
    const recoveringCopy = this.mode === 'headless' && this.changed && currentView && !sameTarget;
    const live = recoveringCopy ? undefined : await this.checkMode();
    if (live) {
      if (!sameTarget) throw new Error('Use VS Code Save As for an open document.');
      if (!await vscode.workspace.save(this.uri)) throw new Error('VS Code could not save this document.');
      return result(request.id, 'Saved the open document.');
    }
    if (this.mode !== 'headless') throw new Error('Open a document before saving.');
    const output = this.backend.save_bytes(path.extname(target.path).slice(1).toLowerCase());
    if (output.byteLength > 32 * 1024 * 1024) throw new Error('The serialized document exceeds 32 MiB.');
    if (sameTarget && hash(await vscode.workspace.fs.readFile(target)) !== this.baseline) throw new Error('The document changed on disk. Save to a different file.');
    if (await findLive(this.provider, target) || ((await this.live()) && !recoveringCopy) || await hasDirtyText(target)) throw new Error('The document is open or modified in an editor. Save or close it before writing from a headless session.');
    if (sameTarget) await vscode.workspace.fs.writeFile(target, output);
    else await writeNewCopy(target, output);
    if (sameTarget) { this.baseline = hash(output); this.backend.mark_saved?.(output); this.changed = false; }
    return result(request.id, 'Saved the document.');
  }
  async handle(line: string): Promise<string | undefined> {
    let request: Message;
    try { request = JSON.parse(line) as Message; } catch { return this.backend.message(line); }
    if (Array.isArray(request)) return JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batch requests are not supported by this editor integration.' } });
    if (!request || typeof request !== 'object') return this.backend.message(line);
    if (this.app.pdf && request.method === 'initialize') {
      const raw = this.backend.message(line);
      if (!raw) return raw;
      const response = JSON.parse(raw) as { result?: { instructions?: string } };
      if (response.result) response.result.instructions = 'Open a PDF with doc_open, then use the listed in-memory PDF tools. Save with doc_save. File export, command passthrough, and desktop-only operations are not available.';
      return JSON.stringify(response);
    }
    if (this.app.pdf && request.method === 'tools/list') {
      const raw = this.backend.message(line);
      if (!raw) return raw;
      const response = JSON.parse(raw) as { result?: { tools?: { name: string }[] } };
      if (response.result?.tools) response.result.tools = response.result.tools.filter(tool => this.app.allowed?.includes(tool.name));
      return JSON.stringify(response);
    }
    if (request.method !== 'tools/call') {
      try {
        const live = ['resources/read', 'resources/list'].includes(request.method ?? '') ? await this.checkMode() : undefined;
        return live ? await live.request('agent:mcp', { message: line }) as string | undefined : this.backend.message(line);
      } catch (error) {
        if (request.id === undefined) return undefined;
        return JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: error instanceof Error ? error.message : 'Document operation failed.' } });
      }
    }
    const name = request.params?.name;
    const args = request.params?.arguments ?? {};
    try {
      if (this.app.allowed && !this.app.allowed.includes(name ?? '')) throw new Error('This tool is not available in the editor integration.');
      if (name === this.app.open) return await this.open(request, args);
      if (name === this.app.save) return await this.save(request, args);
      if (name === this.app.create) throw new Error('Create a document in VS Code first.');
      if (name === 'export') throw new Error('Use VS Code Save As or the editor to export a presentation.');
      const live = await this.checkMode();
      if (this.app.pdf && args.doc !== undefined && args.doc !== this.pdfId) throw new Error('Use the current PDF document id returned by doc_open.');
      if (live && (name === 'edit_undo' || name === 'edit_redo')) { await this.checkHistory(live); await this.provider.agentHistory(live, name === 'edit_redo', 1); return result(request.id, 'Updated the PDF history.'); }
      if (live && (name === 'undo' || name === 'redo')) { await this.checkHistory(live); await this.provider.agentHistory(live, name === 'redo', 1); return result(request.id, 'Updated the document history.'); }
      if ((name === this.app.execute || name === 'command_run' || name === 'invoke_menu') && (typeof args.command === 'string' || typeof args.id === 'string')) {
        const command = typeof args.command === 'string' ? args.command : String(args.id);
        if (live && ['edit.undo', 'edit.redo'].includes(command)) { await this.checkHistory(live); await this.provider.agentHistory(live, command === 'edit.redo', 1); return result(request.id, 'Updated the document history.'); }
        if (/^(file|app|window|ui|show)\./.test(command) || /^document\.(open|save|export)/.test(command)) throw new Error('Use the dedicated document tools or VS Code for this operation.');
      }
      if (name === 'batch') {
        const commands = Array.isArray(args.commands) ? args.commands : [];
        if (commands.some(value => { const command = typeof value === 'object' && value !== null ? (value as { command?: unknown }).command : undefined; return typeof command !== 'string' || /^(file|app|window|ui|show)\./.test(command) || /^document\.(open|save|export)/.test(command) || (live && /^edit\.(undo|redo)$/.test(command)); })) throw new Error('File, UI and live history commands cannot run in a batch.');
      }
      if (live) return await live.request('agent:mcp', { message: line }) as string | undefined;
      if (this.mode === 'none' && !['list_commands', 'parity', ...(this.app.pdf ? ['doc_list', 'doc_inspect'] : [])].includes(name ?? '')) throw new Error(`Open a document first with ${this.app.open}.`);
      const response = this.backend.message(line);
      if (this.mode === 'headless' && !this.app.readonly.includes(name ?? '') && response && !JSON.parse(response).result?.isError) this.changed = true;
      return response;
    } catch (error) { return result(request.id, error instanceof Error ? error.message : 'Document operation failed.', true); }
  }
}

export async function registerWordMcp(context: vscode.ExtensionContext, provider: EditingProvider): Promise<{ command: string; args: string[]; env: Record<string, string> }> {
  const runtimePath = path.join(context.extensionPath, 'media/engines/word/node/viewer.js');
  const app: App = { formats: ['docx'], open: 'open_document', save: 'save_document', create: 'new_document', execute: 'execute', readonly: ['list_commands', 'get_text', 'inspect_document', 'parity', 'render_page'] };
  return registerAgentServer(context, { id: 'craft.word.mcp', name: 'Craft Word', createSession: () => { const runtime = require(runtimePath) as { WordMcpHeadless: new () => Headless }; return new DocumentSession(new runtime.WordMcpHeadless(), provider, app); } });
}

export async function registerDeckMcp(context: vscode.ExtensionContext, provider: EditingProvider): Promise<{ command: string; args: string[]; env: Record<string, string> }> {
  const runtimePath = path.join(context.extensionPath, 'media/engines/deck/node/viewer.js');
  const app: App = { formats: ['pptx'], open: 'open_presentation', save: 'save_presentation', create: 'new_presentation', execute: 'run_command', readonly: ['list_commands', 'inspect_document', 'inspect_slide', 'render_slide'] };
  return registerAgentServer(context, { id: 'craft.powerpoint.mcp', name: 'Craft PowerPoint', createSession: () => { const runtime = require(runtimePath) as { DeckMcpHeadless: new () => Headless }; return new DocumentSession(new runtime.DeckMcpHeadless(), provider, app); } });
}

export async function registerVectorMcp(context: vscode.ExtensionContext, provider: EditingProvider): Promise<{ command: string; args: string[]; env: Record<string, string> }> {
  const runtimePath = path.join(context.extensionPath, 'media/engines/vector/node/viewer.js');
  const app: App = { formats: ['svg', 'vectorcraft'], open: 'open_file', save: 'save_file', create: 'new_document', execute: 'run_command', readonly: ['list_commands', 'inspect_document', 'doc_inspect', 'screenshot'] };
  return registerAgentServer(context, { id: 'craft.vector.mcp', name: 'Craft Vector', createSession: () => { const runtime = require(runtimePath) as { VectorMcpHeadless: new () => Headless }; return new DocumentSession(new runtime.VectorMcpHeadless(), provider, app); } });
}

export async function registerPdfMcp(context: vscode.ExtensionContext, provider: EditingProvider): Promise<{ command: string; args: string[]; env: Record<string, string> }> {
  const runtimePath = path.join(context.extensionPath, 'media/engines/pdf/node/viewer.js');
  const app: App = { formats: ['pdf'], open: 'doc_open', save: 'doc_save', create: 'doc_create', execute: 'command_run', readonly: ['doc_list', 'doc_info', 'page_render', 'text_extract', 'text_find', 'text_word_count', 'doc_inspect', 'render_preview', 'link_list', 'comment_list', 'form_fields', 'text_lines', 'text_paragraphs'], allowed: pdfTools, pdf: true };
  return registerAgentServer(context, { id: 'craft.pdf.mcp', name: 'Craft PDF', createSession: () => { const runtime = require(runtimePath) as { PdfMcpHeadless: new () => Headless }; return new DocumentSession(new runtime.PdfMcpHeadless(), provider, app); } });
}
