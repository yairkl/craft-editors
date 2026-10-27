import { createHash } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { EditableDocument, EditingProvider } from './editing';
import { registerAgentServer } from './mcp-transport';

interface Headless { message(input: string): string | undefined; csv_features(): string; free(): void }
interface Message { jsonrpc?: string; id?: string | number; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } }
const hash = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');
const result = (id: unknown, text: string, error = false): string => JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: error } });
const parseReply = (line: string | undefined): { result?: { isError?: boolean; content?: { text: string }[] }; error?: { message?: string } } => {
  if (!line) throw new Error('GridCraft did not respond.');
  return JSON.parse(line);
};

/** One agent connection owns one headless session and one selected document. */
class WorkbookSession {
  private uri: vscode.Uri | undefined;
  private baseline = '';
  private mode: 'none' | 'live' | 'headless' = 'none';
  private changed = false;
  constructor(private readonly backend: Headless, private readonly provider: EditingProvider) {}
  dispose(): void { this.backend.free(); }
  private uriFor(value: unknown): vscode.Uri {
    if (typeof value !== 'string' || value.length === 0) throw new Error('Provide a workbook path or URI.');
    const uri = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value) ? vscode.Uri.parse(value) : path.isAbsolute(value) ? vscode.Uri.file(value) : vscode.workspace.workspaceFolders?.[0] && vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, value);
    if (!uri || !/\.(xlsx|csv)$/i.test(uri.path)) throw new Error('Choose an XLSX or CSV workbook. Relative paths require an open workspace.');
    return uri;
  }
  private execute(command: string, params: object): { content?: { text: string }[]; isError?: boolean } {
    const reply = parseReply(this.backend.message(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/call', params: { name: 'execute_command', arguments: { command, params } } })));
    if (reply.error) throw new Error(reply.error.message ?? 'GridCraft operation failed.');
    if (!reply.result || reply.result.isError) throw new Error(reply.result?.content?.[0]?.text ?? 'GridCraft operation failed.');
    return reply.result;
  }
  private live(): EditableDocument | undefined { return this.uri ? this.provider.getDocument(this.uri) : undefined; }
  private dirtyText(uri: vscode.Uri): boolean { return vscode.workspace.textDocuments.some(doc => doc.uri.toString() === uri.toString() && doc.isDirty); }
  private checkMode(): EditableDocument | undefined {
    const live = this.live();
    if (this.mode === 'live' && !live) throw new Error('The workbook view was closed. Open the workbook again before continuing.');
    if (this.mode === 'headless' && live) {
      if (this.changed) throw new Error('The workbook was opened while this agent has unsaved changes. Keep the open editor and restart the agent workbook session.');
      this.mode = 'live';
    }
    return live;
  }
  private async open(request: Message, args: Record<string, unknown>): Promise<string> {
    if (this.changed) throw new Error('Save the current headless workbook before opening another.');
    const uri = this.uriFor(args.path);
    if (this.dirtyText(uri)) throw new Error('This file has unsaved changes in a text editor. Save or close that editor first.');
    const live = this.provider.getDocument(uri);
    if (live) { this.uri = uri; this.mode = 'live'; this.changed = false; return result(request.id, 'Opened the live workbook, including unsaved edits.'); }
    const data = await vscode.workspace.fs.readFile(uri);
    if (data.length > 32 * 1024 * 1024) throw new Error('Document exceeds 32 MiB.');
    if (this.provider.getDocument(uri)) throw new Error('The workbook was opened during loading; retry the request.');
    this.execute('file.open', { name: path.basename(uri.path), base64: Buffer.from(data).toString('base64') });
    this.uri = uri; this.mode = 'headless'; this.baseline = hash(data); this.changed = false;
    return result(request.id, 'Opened the workbook in a headless session.');
  }
  private async save(request: Message, args: Record<string, unknown>): Promise<string> {
    if (!this.uri) throw new Error('Open a workbook before saving.');
    const target = args.path ? this.uriFor(args.path) : this.uri;
    if (this.dirtyText(this.uri) || this.dirtyText(target)) throw new Error('This file has unsaved changes in a text editor. Save or close that editor first.');
    const currentView = this.live();
    // A copy can recover unsaved headless changes even if the source was opened
    // in the editor after the agent started working on it.
    const recoveringCopy = this.mode === 'headless' && this.changed && currentView && target.toString() !== this.uri.toString();
    const live = recoveringCopy ? undefined : this.checkMode();
    if (live) {
      if (target.toString() !== this.uri.toString()) throw new Error('Use VS Code Save As for an open workbook.');
      if (!await vscode.workspace.save(this.uri)) throw new Error('VS Code could not save this workbook.');
      return result(request.id, 'Saved the open workbook.');
    }
    if (this.mode !== 'headless') throw new Error('Open a workbook before saving.');
    if (target.path.toLowerCase().endsWith('.csv')) {
      const features = JSON.parse(this.backend.csv_features()) as string[];
      if (features.length) throw new Error(`CSV cannot preserve ${features.join(', ')}. Save as XLSX instead.`);
    }
    const data = this.execute('file.saveBytes', { format: target.path.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx' });
    const encoded = JSON.parse(data.content?.[0]?.text ?? '{}') as { base64?: unknown };
    if (typeof encoded.base64 !== 'string') throw new Error('Could not serialize the workbook.');
    if (target.toString() === this.uri.toString()) {
      const disk = await vscode.workspace.fs.readFile(target);
      if (hash(disk) !== this.baseline) throw new Error('The workbook changed on disk. Save to a different file.');
    }
    if (this.provider.getDocument(target) || (this.live() && !recoveringCopy)) throw new Error('The workbook is open in an editor. Save or close it before writing from a headless session.');
    const output = Buffer.from(encoded.base64, 'base64');
    if (output.byteLength > 32 * 1024 * 1024) throw new Error('The serialized workbook exceeds 32 MiB.');
    await vscode.workspace.fs.writeFile(target, output);
    if (target.toString() === this.uri.toString()) { this.baseline = hash(output); this.changed = false; }
    return result(request.id, 'Saved the workbook.');
  }
  async handle(line: string): Promise<string | undefined> {
    let request: Message;
    try { request = JSON.parse(line) as Message; }
    catch { return this.backend.message(line); }
    if (request.method !== 'tools/call') {
      const live = request.method === 'resources/read' ? this.checkMode() : undefined;
      return live ? await live.request('agent:mcp', { message: line }) as string | undefined : this.backend.message(line);
    }
    const name = request.params?.name;
    const args = request.params?.arguments ?? {};
    try {
      if (name === 'open_workbook') return await this.open(request, args);
      if (name === 'save_workbook') return await this.save(request, args);
      if (name === 'new_workbook') throw new Error('Create a workbook in VS Code first.');
      if (name === 'execute_command' && typeof args.command === 'string' && (args.command.startsWith('file.') || args.command.startsWith('app.') || args.command.startsWith('window.') || args.command.startsWith('ui.') || args.command === 'edit.undo' || args.command === 'edit.redo')) throw new Error('Use the dedicated workbook tools or VS Code for this operation.');
      const live = this.checkMode();
      if (live && (name === 'undo' || name === 'redo')) {
        const steps = args.steps === undefined ? 1 : args.steps;
        if (typeof steps !== 'number' || !Number.isInteger(steps) || steps < 1 || steps > 100) throw new Error('Steps must be between 1 and 100.');
        await this.provider.agentHistory(live, name === 'redo', steps);
        return result(request.id, `${name === 'undo' ? 'Undid' : 'Redid'} ${steps} edit(s).`);
      }
      if (live) return await live.request('agent:mcp', { message: line }) as string | undefined;
      if (this.mode === 'none' && !['list_commands', 'list_functions', 'evaluate_formula'].includes(name ?? '')) throw new Error('Open a workbook first with open_workbook.');
      const response = this.backend.message(line);
      const readonly = ['list_commands', 'list_functions', 'evaluate_formula', 'inspect_workbook', 'read_range', 'get_cell'];
      if (this.mode === 'headless' && !readonly.includes(name ?? '') && response && !parseReply(response).result?.isError) this.changed = true;
      return response;
    } catch (error) { return result(request.id, error instanceof Error ? error.message : 'Workbook operation failed.', true); }
  }
}

export async function registerWorkbookMcp(context: vscode.ExtensionContext, provider: EditingProvider): Promise<{ command: string; args: string[]; env: Record<string, string> }> {
  const runtime = require(path.join(context.extensionPath, 'media/engines/grid/node/viewer.js')) as { McpHeadless: new () => Headless };
  return registerAgentServer(context, {
    id: 'craft.spreadsheets.mcp',
    name: 'Craft Spreadsheets',
    createSession: () => new WorkbookSession(new runtime.McpHeadless(), provider),
  });
}
