import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
interface Frame { rendered: boolean; failure?: string; nonBackgroundPixels: number }
interface Doc { dirty: boolean; request(operation: string, fields?: Record<string, unknown>): Promise<unknown> }
interface Api { onDidRender: vscode.Event<Frame>; mcp?: { command: string; args: string[]; env: Record<string, string> }; editing: { getDocument(uri: vscode.Uri): Doc | undefined; saveCustomDocumentAs(doc: Doc, uri: vscode.Uri, token: vscode.CancellationToken): Promise<void>; revertCustomDocument(doc: Doc, token: vscode.CancellationToken): Promise<void>; backupCustomDocument(doc: Doc, context: {destination:vscode.Uri}, token: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> } }
export async function run(): Promise<void> {
  assert.equal(vscode.env.remoteName, 'ssh-remote', 'Must run through actual Remote SSH');
  const workspace = vscode.workspace.workspaceFolders?.[0]; assert.ok(workspace);
  assert.equal(workspace.uri.scheme, 'file', 'Workspace extension sees the SSH host filesystem');
  const programs = [['spreadsheets','xlsx'],['word','docx'],['powerpoint','pptx'],['pdf','pdf'],['vector','svg']] as const;
  const results: object[] = [];
  for (const [name, format] of programs) {
    const extension = vscode.extensions.getExtension<Api>(`craft-vscode-dev.craft-${name}`); assert.ok(extension);
    const api = await extension.activate(); assert.ok(api.editing, 'Remote development editor must expose the test lifecycle');
    const uri = vscode.Uri.joinPath(workspace.uri, `remote tests עברית/round trip.${format}`);
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspace.uri, 'remote tests עברית'));
    await vscode.workspace.fs.writeFile(uri, await vscode.workspace.fs.readFile(vscode.Uri.joinPath(workspace.uri, `fixtures/minimal.${format}`)));
    const open = async () => {
      const receipt = new Promise<Frame>((resolve, reject) => {
        const timer = setTimeout(() => { listener.dispose(); reject(new Error(`SSH render timed out: ${name}`)); }, 90000);
        const listener = api.onDidRender(frame => { clearTimeout(timer); listener.dispose(); resolve(frame); });
      });
      await vscode.commands.executeCommand('vscode.openWith', uri, `craft.${name === 'spreadsheets' ? 'spreadsheets' : name === 'powerpoint' ? 'powerpoint' : name}.preview`);
      const frame = await receipt; assert.equal(frame.rendered, true, frame.failure); assert.ok(frame.nonBackgroundPixels > 100);
      const doc = api.editing.getDocument(uri); assert.ok(doc); return doc;
    };
    let doc = await open();
    if (format === 'xlsx') {
      assert.ok(api.mcp);
      const client = agent(api.mcp);
      const tool = (name: string, args: object) => client('tools/call', { name, arguments: args });
      assert.equal((await tool('open_workbook', { path: uri.fsPath })).isError, false);
      assert.equal((await tool('set_cell', { cell: 'A7', input: 'SSH agent' })).isError, false);
      assert.equal(await doc.request('test:cell', { sheet: 0, row: 6, col: 0 }), 'SSH agent');
      assert.equal((await tool('undo', {})).isError, false);
      assert.equal(await doc.request('test:cell', { sheet: 0, row: 6, col: 0 }), '');
      client.close();
      const closedUri = vscode.Uri.joinPath(workspace.uri, 'remote tests עברית/agent-closed.xlsx');
      await vscode.workspace.fs.writeFile(closedUri, await vscode.workspace.fs.readFile(vscode.Uri.joinPath(workspace.uri, 'fixtures/minimal.xlsx')));
      const closedClient = agent(api.mcp);
      const closedTool = (name: string, args: object) => closedClient('tools/call', { name, arguments: args });
      assert.equal((await closedTool('open_workbook', { path: closedUri.fsPath })).isError, false);
      assert.equal((await closedTool('set_cell', { cell: 'A7', input: 'SSH closed' })).isError, false);
      assert.equal((await closedTool('save_workbook', {})).isError, false);
      closedClient.close();
    }
    if (format === 'docx') {
      assert.ok(api.mcp);
      const client = agent(api.mcp);
      const tool = (name: string, args: object) => client('tools/call', { name, arguments: args });
      const initial = await doc.request('test:text');
      assert.equal((await tool('open_document', { path: uri.fsPath })).isError, false);
      assert.equal((await tool('type_text', { text: 'SSH Word agent ' })).isError, false);
      assert.ok(String(await doc.request('test:text')).includes('SSH Word agent'));
      assert.equal((await tool('execute', { command: 'edit.undo' })).isError, false);
      assert.equal(await doc.request('test:text'), initial);
      client.close();
      const closedUri = vscode.Uri.joinPath(workspace.uri, 'remote tests עברית/agent-closed.docx');
      await vscode.workspace.fs.writeFile(closedUri, await vscode.workspace.fs.readFile(vscode.Uri.joinPath(workspace.uri, 'fixtures/minimal.docx')));
      const closed = agent(api.mcp);
      const closedTool = (name: string, args: object) => closed('tools/call', { name, arguments: args });
      assert.equal((await closedTool('open_document', { path: closedUri.fsPath })).isError, false);
      assert.equal((await closedTool('type_text', { text: 'SSH closed Word ' })).isError, false);
      assert.equal((await closedTool('save_document', {})).isError, false);
      closed.close();
    }
    if (format === 'xlsx') await doc.request('test:edit', { row: 5, col: 0, text: 'SSH שלום' });
    else if (format === 'pdf') await doc.request('test:command', { command: 'page.rotate' });
    else if (format === 'svg') await doc.request('test:command', { command: 'text.create', params: { x: 40, y: 280, text: 'SSH שלום', size: 28 } });
    else await doc.request('test:paste', { text: 'SSH שלום ' });
    assert.equal(doc.dirty, true);
    await vscode.commands.executeCommand('undo');
    assert.equal(doc.dirty, false, 'Remote Undo must restore the clean revision');
    await vscode.commands.executeCommand('redo');
    assert.equal(doc.dirty, true);
    const cancellation = new vscode.CancellationTokenSource();
    const copy = vscode.Uri.joinPath(workspace.uri, `remote tests עברית/save as.${format}`);
    const original = await vscode.workspace.fs.readFile(uri);
    await api.editing.saveCustomDocumentAs(doc, copy, cancellation.token);
    assert.deepEqual(await vscode.workspace.fs.readFile(uri), original, 'SSH Save As must preserve the original');
    const backup = await api.editing.backupCustomDocument(doc, {destination:vscode.Uri.joinPath(workspace.uri, `remote tests עברית/${name}.backup`)}, cancellation.token);
    assert.ok((await vscode.workspace.fs.readFile(vscode.Uri.parse(backup.id))).byteLength > 0);
    await backup.delete();
    await api.editing.revertCustomDocument(doc, cancellation.token);
    assert.equal(doc.dirty, false);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    // Reopen the Save As copy to prove the remotely serialized edit.
    await vscode.workspace.fs.writeFile(uri, await vscode.workspace.fs.readFile(copy));
    doc = await open();
    cancellation.dispose();
    assert.ok(await vscode.workspace.save(uri)); assert.equal(doc.dirty, false);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    doc = await open();
    if (format === 'xlsx') assert.equal(await doc.request('test:cell', { sheet: 0, row: 5, col: 0 }), 'SSH שלום');
    else if (format === 'pdf') assert.equal((await doc.request('test:inspect') as { rotations: number[] }).rotations[0], 90);
    else assert.ok(String(await doc.request('test:text')).includes('SSH שלום'));
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    results.push({ program: name, rendered: true, saved: true, reopened: true, undoRedo: true, saveAs: true, revert: true, backup: true, remoteName: vscode.env.remoteName, sourceScheme: uri.scheme, extensionHost: require('node:os').hostname() });
    console.log(`REMOTE_SSH_PASS ${name}`);
  }
  await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(workspace.uri, 'remote-results.json'), Buffer.from(JSON.stringify(results, null, 2)));
}

function agent(config: NonNullable<Api['mcp']>) {
  const child = spawn(config.command, config.args, { env: { ...process.env, ...config.env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map<number, { resolve(value: { isError?: boolean }): void; reject(error: Error): void }>();
  let id = 0;
  lines.on('line', line => { const response = JSON.parse(line) as { id: number; result: { isError?: boolean } }; const waiter = pending.get(response.id); if (waiter) { pending.delete(response.id); waiter.resolve(response.result); } });
  child.on('exit', () => { for (const waiter of pending.values()) waiter.reject(new Error('MCP proxy exited')); pending.clear(); });
  const call = (method: string, params: object): Promise<{ isError?: boolean }> => new Promise((resolve, reject) => {
    const requestId = ++id; const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('MCP request timed out')); }, 15000);
    pending.set(requestId, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
  });
  return Object.assign(call, { close: () => child.stdin.end() });
}
