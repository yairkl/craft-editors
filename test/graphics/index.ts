import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import type { EditingProvider } from '../../src/editing';
import type { RenderResult } from '../../src/rendering';
import { assertIsolation, fixture, root, selected } from '../environment';
interface Api { editing: EditingProvider; onDidRender: vscode.Event<RenderResult>; mcp?: { command: string; args: string[]; env: Record<string, string> } }
interface State { readMode?: boolean; zoom: number; draft?: string; rotations?: number[] }
export async function run(): Promise<void> {
  assertIsolation();
  const directory = vscode.Uri.file(path.join(root!, 'artifacts/graphics'));
  await vscode.workspace.fs.createDirectory(directory);
  const cancellation = new vscode.CancellationTokenSource();
  for (const descriptor of selected.filter(d => ['pdf', 'svg'].includes(d.format))) {
    const extension = vscode.extensions.getExtension<Api>(descriptor.id); assert.ok(extension);
    const api = await extension.activate(); assert.ok(api.editing);
    const engine = descriptor.format === 'pdf' ? 'pdf' : 'vector';
    const runtime = require.resolve(path.join(extension.extensionPath, `media/engines/${engine}/node/viewer.js`));
    assert.equal(require.cache[runtime], undefined, 'Agent WASM should not load before an agent connects');
    const original = await vscode.workspace.fs.readFile(fixture(`minimal.${descriptor.format}`));
    const uri = vscode.Uri.joinPath(directory, `roundtrip.${descriptor.format}`);
    await vscode.workspace.fs.writeFile(uri, original);
    const open = async (target: vscode.Uri) => {
      const rendered = receipt(api);
      await vscode.commands.executeCommand('vscode.openWith', target, descriptor.preview);
      const frame = await rendered; assert.equal(frame.rendered, true, frame.failure);
      if (frame.screenshot) {
        const output = path.join(root!, 'artifacts/rendering'); await mkdir(output, { recursive: true });
        await writeFile(path.join(output, `native.${descriptor.format}.png`), Buffer.from(frame.screenshot.split(',')[1]!, 'base64'));
      }
      const doc = api.editing.getDocument(target); assert.ok(doc); return doc;
    };
    let doc = await open(uri);
    assert.equal(doc.dirty, false);
    if (descriptor.format === 'pdf') {
      assert.ok(api.mcp);
      const client = agent(api.mcp);
      const tool = (name: string, args: object) => client('tools/call', { name, arguments: args });
      const listing = await client('tools/list', {});
      assert.ok(listing.tools?.some(entry => entry.name === 'page_rotate'));
      assert.ok(!listing.tools?.some(entry => entry.name === 'command_run'));
      const rejectedBatch = await client.batch([{ jsonrpc: '2.0', id: 99, method: 'tools/call', params: { name: 'command_run', arguments: {} } }]);
      assert.equal(rejectedBatch.error.code, -32600, 'Batches cannot bypass host routing or tool restrictions');
      const opened = await tool('doc_open', { path: uri.fsPath });
      assert.equal(opened.isError, false);
      const id = (JSON.parse(opened.content?.[0]?.text ?? '{}') as { doc: number }).doc;
      assert.ok(Number.isSafeInteger(id));
      assert.equal((await tool('page_render', { doc: id, page: 1, dpi: 72 })).isError, false);
      assert.equal((await tool('page_rotate', { doc: id, pages: [1], degrees: 90 })).isError, false);
      assert.equal((await doc.request('test:inspect') as State).rotations?.[0], 90);
      await waitFor(() => doc.dirty);
      assert.equal((await tool('edit_undo', { doc: id })).isError, false);
      assert.equal((await doc.request('test:inspect') as State).rotations?.[0], 0);
      await doc.request('test:pdf-draft', { text: 'Agent safety draft' });
      assert.equal((await tool('page_rotate', { doc: id, pages: [1], degrees: 90 })).isError, true, 'An active PDF draft must not be overwritten by an agent');
      assert.equal((await tool('edit_undo', { doc: id })).isError, true, 'Agent history must not discard an active PDF draft');
      assert.ok((await doc.request('test:inspect') as State).draft?.includes('Agent safety draft'));
      await api.editing.revertCustomDocument(doc, cancellation.token);
      client.close();
      const closedUri = vscode.Uri.joinPath(directory, 'agent-closed.pdf');
      await vscode.workspace.fs.writeFile(closedUri, original);
      const closed = agent(api.mcp);
      const closedTool = (name: string, args: object) => closed('tools/call', { name, arguments: args });
      const closedOpen = await closedTool('doc_open', { path: closedUri.fsPath });
      assert.equal(closedOpen.isError, false);
      const closedId = (JSON.parse(closedOpen.content?.[0]?.text ?? '{}') as { doc: number }).doc;
      assert.equal((await closedTool('page_rotate', { doc: closedId, pages: [1], degrees: 90 })).isError, false);
      assert.deepEqual(await vscode.workspace.fs.readFile(closedUri), original);
      const external = Buffer.from('external change');
      await vscode.workspace.fs.writeFile(closedUri, external);
      assert.equal((await closedTool('doc_save', { doc: closedId })).isError, true, 'Headless PDF save must detect external changes');
      assert.deepEqual(await vscode.workspace.fs.readFile(closedUri), external);
      await vscode.workspace.fs.writeFile(closedUri, original);
      assert.equal((await closedTool('doc_save', { doc: closedId })).isError, false);
      const savedInfo = await closedTool('doc_info', { doc: closedId });
      assert.equal((JSON.parse(savedInfo.content?.[0]?.text ?? '{}') as { document: { dirty: boolean } }).document.dirty, false);
      closed.close();
      const closedDoc = await open(closedUri);
      assert.equal((await closedDoc.request('test:inspect') as State).rotations?.[0], 90);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await vscode.commands.executeCommand('vscode.openWith', uri, descriptor.preview);
    }
    if (descriptor.format === 'svg') {
      assert.ok(api.mcp);
      const client = agent(api.mcp);
      const tool = (name: string, args: object) => client('tools/call', { name, arguments: args });
      let agentPath = uri.fsPath;
      if (process.platform !== 'win32') {
        const alias = vscode.Uri.joinPath(directory, 'agent-live-alias.svg');
        await rm(alias.fsPath, { force: true }); await symlink(uri.fsPath, alias.fsPath); agentPath = alias.fsPath;
      }
      assert.equal((await tool('open_file', { path: agentPath })).isError, false);
      const initialText = await doc.request('test:text');
      assert.equal((await tool('add_text', { x: 25, y: 260, text: 'live vector agent', size: 24 })).isError, false);
      assert.ok(String(await doc.request('test:text')).includes('live vector agent'));
      await waitFor(() => doc.dirty);
      assert.equal((await tool('undo', {})).isError, false);
      assert.equal(await doc.request('test:text'), initialText);
      client.close();
      const closedUri = vscode.Uri.joinPath(directory, 'agent-closed.svg');
      await vscode.workspace.fs.writeFile(closedUri, original);
      const closed = agent(api.mcp);
      const closedTool = (name: string, args: object) => closed('tools/call', { name, arguments: args });
      assert.equal((await closedTool('open_file', { path: closedUri.fsPath })).isError, false);
      assert.equal((await closedTool('add_text', { x: 25, y: 260, text: 'closed vector agent', size: 24 })).isError, false);
      assert.deepEqual(await vscode.workspace.fs.readFile(closedUri), original);
      assert.equal((await closedTool('save_file', {})).isError, false);
      const savedVector = await closedTool('inspect_document', {});
      assert.equal((JSON.parse(savedVector.content?.[0]?.text ?? '{}') as { dirty: boolean }).dirty, false);
      closed.close();
      const closedDoc = await open(closedUri);
      assert.ok(String(await closedDoc.request('test:text')).includes('closed vector agent'));
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await vscode.commands.executeCommand('vscode.openWith', uri, descriptor.preview);
      const textUri = vscode.Uri.joinPath(directory, 'agent-text-dirty.svg');
      await vscode.workspace.fs.writeFile(textUri, original);
      const textDoc = await vscode.workspace.openTextDocument(textUri);
      await vscode.window.showTextDocument(textDoc);
      const edit = new vscode.WorkspaceEdit(); edit.insert(textUri, new vscode.Position(0, 0), '<!-- unsaved -->\n');
      assert.ok(await vscode.workspace.applyEdit(edit)); assert.equal(textDoc.isDirty, true);
      const guarded = agent(api.mcp);
      let dirtyPath = textUri.fsPath;
      if (process.platform !== 'win32') {
        const alias = vscode.Uri.joinPath(directory, 'agent-text-alias.svg');
        await rm(alias.fsPath, { force: true }); await symlink(textUri.fsPath, alias.fsPath); dirtyPath = alias.fsPath;
      }
      assert.equal((await guarded('tools/call', { name: 'open_file', arguments: { path: dirtyPath } })).isError, true, 'Agent must not ignore unsaved text-editor changes, including symlink aliases');
      guarded.close();
      await vscode.commands.executeCommand('workbench.action.files.revert');
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await vscode.commands.executeCommand('vscode.openWith', uri, descriptor.preview);
    }
    if (descriptor.format === 'pdf') {
      await doc.request('test:command', { command: 'create.blank' });
      assert.equal(doc.dirty, false, 'Unsupported multi-document workflows cannot replace the host document');
    }
    const initial = await doc.request('test:inspect') as State;
    if (descriptor.format === 'pdf') assert.equal(initial.readMode, true, 'PDF opens in native Read preview workspace');
    const enlarged = await doc.request('test:wheel', { delta: -1 }) as State;
    assert.ok(enlarged.zoom > initial.zoom, `${descriptor.format}: Ctrl+wheel must zoom in (${initial.zoom} to ${enlarged.zoom})`);
    const reduced = await doc.request('test:wheel', { delta: 1 }) as State;
    assert.ok(reduced.zoom < enlarged.zoom, 'Ctrl+wheel must zoom out');
    assert.equal(doc.dirty, false, 'Viewport zoom is not a content edit');
    assert.deepEqual(await vscode.workspace.fs.readFile(uri), original);
    if (descriptor.format === 'pdf') {
      const draft = await doc.request('test:pdf-draft', { text: 'Draft text' }) as State;
      assert.ok(draft.draft?.includes('Draft text'), 'Real native PDF typing opens a draft');
      await waitFor(() => doc.dirty);
      await assert.rejects(api.editing.saveCustomDocument(doc, cancellation.token), vscode.CancellationError);
      assert.deepEqual(await vscode.workspace.fs.readFile(uri), original);
      assert.ok((await doc.request('test:inspect') as State).draft?.includes('Draft text'));
      await doc.request('test:commit');
      assert.ok(String(await doc.request('test:text')).includes('Draft text'), 'Explicit native commit applies PDF text');
      const textCopy = vscode.Uri.joinPath(directory, 'typed.pdf');
      await api.editing.saveCustomDocumentAs(doc, textCopy, cancellation.token);
      assert.deepEqual(await vscode.workspace.fs.readFile(uri), original);
      await api.editing.revertCustomDocument(doc, cancellation.token);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      const savedText = await open(textCopy);
      assert.ok(String(await savedText.request('test:text')).includes('Draft text'), 'Native PDF text survives serialization and reopening');
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      doc = await open(uri);
      assert.equal(doc.dirty, false);
    }
    const before = await doc.request('test:text');
    const command = descriptor.format === 'pdf' ? 'page.rotate' : 'shape.rectangle';
    const params = { x: 310, y: 260, width: 77, height: 55 };
    await doc.request('test:command', { command, params });
    await waitFor(() => doc.dirty);
    const after = await doc.request('test:text');
    const edited = await doc.request('test:inspect') as State;
    if (descriptor.format === 'pdf') assert.equal(edited.rotations?.[0], 90);
    else assert.notEqual(after, before);
    await doc.request('test:history', { redo: false }); await waitFor(() => !doc.dirty);
    if (descriptor.format === 'pdf') assert.equal((await doc.request('test:inspect') as State).rotations?.[0], 0);
    else assert.equal(await doc.request('test:text'), before);
    await doc.request('test:history', { redo: true }); await waitFor(() => doc.dirty);
    const backup = await api.editing.backupCustomDocument(doc, { destination: vscode.Uri.joinPath(directory, `${descriptor.format}.backup`) }, cancellation.token);
    assert.ok(await vscode.workspace.save(uri)); assert.equal(doc.dirty, false);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    doc = await open(uri);
    if (descriptor.format === 'pdf') assert.equal((await doc.request('test:inspect') as State).rotations?.[0], 90);
    else assert.ok(String(await doc.request('test:text')).includes('77'), 'SVG shape survives save/reopen');
    if (descriptor.format === 'svg') {
      const nativeBytes = await doc.request('test:native-bytes'); assert.ok(nativeBytes instanceof ArrayBuffer);
      const nativeUri = vscode.Uri.joinPath(directory, 'native.vectorcraft');
      await vscode.workspace.fs.writeFile(nativeUri, new Uint8Array(nativeBytes));
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      assert.ok(api.mcp);
      const nativeAgent = agent(api.mcp);
      const nativeTool = (name: string, args: object) => nativeAgent('tools/call', { name, arguments: args });
      assert.equal((await nativeTool('open_file', { path: nativeUri.fsPath })).isError, false);
      assert.equal((await nativeTool('add_text', { x: 20, y: 240, text: 'native vector agent', size: 24 })).isError, false);
      assert.equal((await nativeTool('save_file', {})).isError, false);
      nativeAgent.close();
      const native = await open(nativeUri);
      assert.ok(String(await native.request('test:text')).includes('native vector agent'));
      await native.request('test:command', { command, params: { ...params, width: 99 } });
      assert.ok(await vscode.workspace.save(nativeUri));
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      const reopenedNative = await open(nativeUri);
      assert.ok(String(await reopenedNative.request('test:text')).includes('99'));
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      doc = await open(uri);
    }
    await doc.request('test:command', { command, params: { ...params, width: 88 } });
    const copy = vscode.Uri.joinPath(directory, `copy.${descriptor.format}`);
    const disk = await vscode.workspace.fs.readFile(uri);
    await api.editing.saveCustomDocumentAs(doc, copy, cancellation.token);
    assert.deepEqual(await vscode.workspace.fs.readFile(uri), disk);
    await api.editing.revertCustomDocument(doc, cancellation.token);
    assert.equal(doc.dirty, false);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    const recoveredUri = vscode.Uri.joinPath(directory, `recovered.${descriptor.format}`);
    await vscode.workspace.fs.writeFile(recoveredUri, original);
    const recovered = await api.editing.openCustomDocument(recoveredUri, { backupId: backup.id, untitledDocumentData: undefined }, cancellation.token);
    const panel = api.editing.createRecoveryTestPanel();
    const rendered = receipt(api); await api.editing.resolveCustomEditor(recovered, panel, cancellation.token);
    assert.equal((await rendered).rendered, true);
    assert.equal(recovered.dirty, true);
    if (descriptor.format === 'pdf') assert.equal((await recovered.request('test:inspect') as State).rotations?.[0], 90);
    assert.equal(await recovered.request('test:host-shortcut'), true, 'Keyboard events must reach the host keybinding listener');
    panel.dispose(); recovered.dispose(); await backup.delete();
    console.log(`${descriptor.format}: native edits, scroll zoom, Undo/Redo, Save/reopen, Save As, Revert and backup recovery passed.`);
  }
  cancellation.dispose();
}
function receipt(api: Api): Promise<RenderResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { listener.dispose(); reject(new Error('Editor did not render')); }, 70000);
    const listener = api.onDidRender(result => { clearTimeout(timer); listener.dispose(); resolve(result); });
  });
}
async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Graphics lifecycle timed out'); await new Promise(resolve => setTimeout(resolve, 25)); }
}

function agent(config: NonNullable<Api['mcp']>) {
  const child = spawn(config.command, config.args, { env: { ...process.env, ...config.env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  type Reply = { isError?: boolean; content?: { text?: string }[]; tools?: { name: string }[] };
  const pending = new Map<number, { resolve(value: Reply): void; reject(error: Error): void }>();
  let sequence = 0;
  lines.on('line', line => { const response = JSON.parse(line) as { id: number; result: Reply }; const waiter = pending.get(response.id); if (waiter) { pending.delete(response.id); waiter.resolve(response.result); } });
  child.on('exit', () => { for (const waiter of pending.values()) waiter.reject(new Error('MCP proxy exited')); pending.clear(); });
  const call = (method: string, params: object): Promise<Reply> => new Promise((resolve, reject) => {
    const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error('MCP request timed out')); }, 15000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  return Object.assign(call, {
    close: () => child.stdin.end(),
    batch: async (requests: object[]): Promise<{ error: { code: number } }> => {
      const response = once(lines, 'line', { signal: AbortSignal.timeout(15000) }); child.stdin.write(JSON.stringify(requests) + '\n');
      const [line] = await response; return JSON.parse(String(line));
    },
  });
}
