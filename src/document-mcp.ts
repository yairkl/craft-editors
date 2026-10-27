import { createHash } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { EditableDocument, EditingProvider } from './editing';
import { registerAgentServer } from './mcp-transport';

interface Headless { message(input: string): string | undefined; open_bytes(input: Uint8Array): void; save_bytes(): Uint8Array; free(): void }
interface Message { id?: string | number; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } }
interface App { format: 'docx' | 'pptx'; open: string; save: string; create: string; execute: string; readonly: string[] }
const hash = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');
const result = (id: unknown, text: string, error = false): string => JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: error } });

class DocumentSession {
  private uri: vscode.Uri | undefined;
  private baseline = '';
  private mode: 'none' | 'live' | 'headless' = 'none';
  private changed = false;
  constructor(private readonly backend: Headless, private readonly provider: EditingProvider, private readonly app: App) {}
  dispose(): void { this.backend.free(); }
  private uriFor(value: unknown): vscode.Uri {
    if (typeof value !== 'string' || !value) throw new Error('Provide a document path or URI.');
    const uri = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value) ? vscode.Uri.parse(value) : path.isAbsolute(value) ? vscode.Uri.file(value) : vscode.workspace.workspaceFolders?.[0] && vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, value);
    if (!uri || !uri.path.toLowerCase().endsWith(`.${this.app.format}`)) throw new Error(`Choose a ${this.app.format.toUpperCase()} document. Relative paths require an open workspace.`);
    return uri;
  }
  private live(): EditableDocument | undefined { return this.uri ? this.provider.getDocument(this.uri) : undefined; }
  private checkMode(): EditableDocument | undefined {
    const live = this.live();
    if (this.mode === 'live' && !live) throw new Error('The document view was closed. Open the document again before continuing.');
    if (this.mode === 'headless' && live) {
      if (this.changed) throw new Error('The document was opened while this agent has unsaved changes. Save them to another path.');
      this.mode = 'live';
    }
    return live;
  }
  private async open(request: Message, args: Record<string, unknown>): Promise<string> {
    if (this.changed) throw new Error('Save the current headless document before opening another.');
    if (args.password) throw new Error('Password-protected documents are not supported by this integration.');
    const uri = this.uriFor(args.path);
    if (this.provider.getDocument(uri)) { this.uri = uri; this.mode = 'live'; return result(request.id, 'Opened the live document, including unsaved edits.'); }
    const data = await vscode.workspace.fs.readFile(uri);
    if (data.length > 32 * 1024 * 1024) throw new Error('Document exceeds 32 MiB.');
    if (this.provider.getDocument(uri)) throw new Error('The document was opened during loading; retry the request.');
    this.backend.open_bytes(data);
    this.uri = uri; this.baseline = hash(data); this.mode = 'headless'; this.changed = false;
    return result(request.id, 'Opened the document in a headless session.');
  }
  private async save(request: Message, args: Record<string, unknown>): Promise<string> {
    if (!this.uri) throw new Error('Open a document before saving.');
    const target = args.path ? this.uriFor(args.path) : this.uri;
    const recoveringCopy = this.mode === 'headless' && this.changed && this.live() && target.toString() !== this.uri.toString();
    const live = recoveringCopy ? undefined : this.checkMode();
    if (live) {
      if (target.toString() !== this.uri.toString()) throw new Error('Use VS Code Save As for an open document.');
      if (!await vscode.workspace.save(this.uri)) throw new Error('VS Code could not save this document.');
      return result(request.id, 'Saved the open document.');
    }
    if (this.mode !== 'headless') throw new Error('Open a document before saving.');
    const output = this.backend.save_bytes();
    if (target.toString() === this.uri.toString() && hash(await vscode.workspace.fs.readFile(target)) !== this.baseline) throw new Error('The document changed on disk. Save to a different file.');
    if (this.provider.getDocument(target) || (this.live() && !recoveringCopy)) throw new Error('The document is open in an editor. Save or close it before writing from a headless session.');
    await vscode.workspace.fs.writeFile(target, output);
    if (target.toString() === this.uri.toString()) { this.baseline = hash(output); this.changed = false; }
    return result(request.id, 'Saved the document.');
  }
  async handle(line: string): Promise<string | undefined> {
    let request: Message;
    try { request = JSON.parse(line) as Message; } catch { return this.backend.message(line); }
    if (request.method !== 'tools/call') {
      const live = request.method === 'resources/read' ? this.checkMode() : undefined;
      return live ? await live.request('agent:mcp', { message: line }) as string | undefined : this.backend.message(line);
    }
    const name = request.params?.name;
    const args = request.params?.arguments ?? {};
    try {
      if (name === this.app.open) return await this.open(request, args);
      if (name === this.app.save) return await this.save(request, args);
      if (name === this.app.create) throw new Error('Create a document in VS Code first.');
      if (name === 'export') throw new Error('Use VS Code Save As or the editor to export a presentation.');
      const live = this.checkMode();
      if (name === this.app.execute && typeof args.command === 'string') {
        const command = args.command;
        if (live && ['edit.undo', 'edit.redo'].includes(command)) { await this.provider.agentHistory(live, command === 'edit.redo', 1); return result(request.id, 'Updated the document history.'); }
        if (/^(file|app|window|ui|show)\./.test(command)) throw new Error('Use the dedicated document tools or VS Code for this operation.');
      }
      if (name === 'batch') {
        const commands = Array.isArray(args.commands) ? args.commands : [];
        if (commands.some(value => { const command = typeof value === 'object' && value !== null ? (value as { command?: unknown }).command : undefined; return typeof command !== 'string' || /^(file|app|window|ui|show)\./.test(command) || (live && /^edit\.(undo|redo)$/.test(command)); })) throw new Error('File, UI and live history commands cannot run in a batch.');
      }
      if (live) return await live.request('agent:mcp', { message: line }) as string | undefined;
      if (this.mode === 'none' && !['list_commands', 'parity'].includes(name ?? '')) throw new Error(`Open a document first with ${this.app.open}.`);
      const response = this.backend.message(line);
      if (this.mode === 'headless' && !this.app.readonly.includes(name ?? '') && response && !JSON.parse(response).result?.isError) this.changed = true;
      return response;
    } catch (error) { return result(request.id, error instanceof Error ? error.message : 'Document operation failed.', true); }
  }
}

export async function registerWordMcp(context: vscode.ExtensionContext, provider: EditingProvider): Promise<{ command: string; args: string[]; env: Record<string, string> }> {
  const runtime = require(path.join(context.extensionPath, 'media/engines/word/node/viewer.js')) as { WordMcpHeadless: new () => Headless };
  const app: App = { format: 'docx', open: 'open_document', save: 'save_document', create: 'new_document', execute: 'execute', readonly: ['list_commands', 'get_text', 'inspect_document', 'parity', 'render_page'] };
  return registerAgentServer(context, { id: 'craft.word.mcp', name: 'Craft Word', createSession: () => new DocumentSession(new runtime.WordMcpHeadless(), provider, app) });
}

export async function registerDeckMcp(context: vscode.ExtensionContext, provider: EditingProvider): Promise<{ command: string; args: string[]; env: Record<string, string> }> {
  const runtime = require(path.join(context.extensionPath, 'media/engines/deck/node/viewer.js')) as { DeckMcpHeadless: new () => Headless };
  const app: App = { format: 'pptx', open: 'open_presentation', save: 'save_presentation', create: 'new_presentation', execute: 'run_command', readonly: ['list_commands', 'inspect_document', 'inspect_slide', 'render_slide'] };
  return registerAgentServer(context, { id: 'craft.powerpoint.mcp', name: 'Craft PowerPoint', createSession: () => new DocumentSession(new runtime.DeckMcpHeadless(), provider, app) });
}
