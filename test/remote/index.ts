import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
interface Frame { rendered: boolean; failure?: string; nonBackgroundPixels: number }
interface Doc { dirty: boolean; request(operation: string, fields?: Record<string, unknown>): Promise<unknown> }
interface Api { onDidRender: vscode.Event<Frame>; editing: { getDocument(uri: vscode.Uri): Doc | undefined; saveCustomDocumentAs(doc: Doc, uri: vscode.Uri, token: vscode.CancellationToken): Promise<void>; revertCustomDocument(doc: Doc, token: vscode.CancellationToken): Promise<void>; backupCustomDocument(doc: Doc, context: {destination:vscode.Uri}, token: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> } }
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
