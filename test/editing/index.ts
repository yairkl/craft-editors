import { strict as assert } from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { EditableDocument, EditingProvider } from '../../src/editing';
import type { RenderResult } from '../../src/rendering';
import { assertIsolation, fixture, root } from '../environment';
interface EditorApi { editing: EditingProvider; onDidRender: vscode.Event<RenderResult> }
export async function run(): Promise<void> {
  assertIsolation();
  const extension = vscode.extensions.getExtension<EditorApi>('craft-vscode-dev.craft-spreadsheets');
  assert.ok(extension);
  const api = await extension.activate();
  assert.ok(api.editing);
  const directory = vscode.Uri.file(path.join(root!, 'artifacts/editing'));
  await vscode.workspace.fs.createDirectory(directory);
  const original = await vscode.workspace.fs.readFile(fixture('minimal.xlsx'));
  const uri = vscode.Uri.joinPath(directory, 'roundtrip.xlsx');
  await vscode.workspace.fs.writeFile(uri, original);
  let doc = await open(api, uri);
  assert.equal(await cell(doc), '42');
  assert.equal(await edit(doc, '21'), '21');
  assert.equal(await cell(doc, 2), '42', 'The native calculation engine recalculates formulas');
  assert.equal(doc.dirty, true);
  assert.deepEqual(await vscode.workspace.fs.readFile(uri), original, 'Editing alone cannot write the original');
  assert.ok(await vscode.workspace.save(uri), 'VS Code Save must succeed');
  assert.equal(doc.dirty, false);
  await vscode.commands.executeCommand('undo');
  assert.equal(await cell(doc), '42');
  assert.equal(doc.dirty, true);
  await vscode.commands.executeCommand('redo');
  assert.equal(await cell(doc), '21');
  assert.equal(doc.dirty, false);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  doc = await open(api, uri);
  assert.equal(await cell(doc), '21', 'Saved cell value must survive close and reopen');
  assert.equal(await cell(doc, 2), '42');
  await edit(doc, '30');
  await revert(doc);
  assert.equal(await cell(doc), '21');
  assert.equal(doc.dirty, false);

  console.log('Editing round trip and revert passed');
  // External modifications are never silently overwritten.
  await edit(doc, '30');
  await vscode.workspace.fs.writeFile(uri, original);
  const cancellation = new vscode.CancellationTokenSource();
  await assert.rejects(api.editing.saveCustomDocument(doc, cancellation.token), /changed on disk/);
  assert.equal(doc.dirty, true);
  assert.deepEqual(await vscode.workspace.fs.readFile(uri), original);
  const copy = vscode.Uri.joinPath(directory, 'save-as.xlsx');
  await api.editing.saveCustomDocumentAs(doc, copy, cancellation.token);
  assert.deepEqual(await vscode.workspace.fs.readFile(uri), original, 'Save As must leave original bytes intact');
  await assert.rejects(api.editing.saveCustomDocumentAs(doc, vscode.Uri.joinPath(directory, 'wrong.pdf'), cancellation.token), /XLSX/);
  await revert(doc);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  const copied = await open(api, copy);
  assert.equal(await cell(copied), '30', 'Save As copy contains the edited value');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

  console.log('Save As passed');
  let memory = original;
  let denyWrites = true;
  let blockedWrite: (() => void) | undefined;
  let enteredWrite: (() => void) | undefined;
  const changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  const registration = vscode.workspace.registerFileSystemProvider('craft-edit-test', {
    onDidChangeFile: changes.event, watch: () => new vscode.Disposable(() => {}),
    stat: uri => ({ type: uri.path.endsWith('.xlsx') ? vscode.FileType.File : vscode.FileType.Directory, ctime: 0, mtime: 0, size: memory.byteLength }),
    readDirectory: () => [], readFile: () => memory,
    writeFile: async (_uri, data) => {
      if (denyWrites) throw vscode.FileSystemError.NoPermissions('Test destination is read only');
      if (enteredWrite) {
        const callback = enteredWrite; enteredWrite = undefined; callback();
        await new Promise<void>(resolve => { blockedWrite = resolve; });
      }
      memory = Uint8Array.from(data);
    },
    createDirectory: () => {}, delete: () => {}, rename: () => {},
  });
  const remote = vscode.Uri.parse('craft-edit-test:/remote/book.xlsx');
  try {
    const remoteDoc = await open(api, remote);
    await edit(remoteDoc, '35');
    await assert.rejects(api.editing.saveCustomDocument(remoteDoc, cancellation.token), /read only|permissions/i);
    assert.equal(remoteDoc.dirty, true, 'Failed writes must keep edits dirty');
    assert.deepEqual(memory, original);
    const cancelled = new vscode.CancellationTokenSource(); cancelled.cancel();
    await assert.rejects(api.editing.saveCustomDocument(remoteDoc, cancelled.token), vscode.CancellationError);
    cancelled.dispose();
    console.log('Failed/cancelled saves passed');
    denyWrites = false;
    assert.ok(await vscode.workspace.save(remote));
    console.log('Remote Save passed');
    await edit(remoteDoc, '40');
    const started = new Promise<void>(resolve => { enteredWrite = resolve; });
    const saving = vscode.workspace.save(remote);
    await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(new Error('Save never entered write')), 10000))]);
    await edit(remoteDoc, '45');
    assert.ok(blockedWrite); blockedWrite(); blockedWrite = undefined;
    assert.ok(await saving);
    assert.equal(await cell(remoteDoc), '45');
    assert.equal(remoteDoc.dirty, true, 'Edits made during a write must stay dirty');
    assert.notEqual(remoteDoc.token, remoteDoc.savedToken);
    assert.ok(await vscode.workspace.save(remote));
    assert.equal(remoteDoc.dirty, false);

    console.log('Concurrent save passed');
    await edit(remoteDoc, '50');
    const backupUri = vscode.Uri.joinPath(directory, 'recovery.backup');
    const backup = await api.editing.backupCustomDocument(remoteDoc, { destination: backupUri }, cancellation.token);
    const recoveredUri = vscode.Uri.joinPath(directory, 'recovered.xlsx');
    await vscode.workspace.fs.writeFile(recoveredUri, memory);
    const recovered = await api.editing.openCustomDocument(recoveredUri, { backupId: backup.id, untitledDocumentData: undefined }, cancellation.token);
    const panel = api.editing.createRecoveryTestPanel();
    const rendered = renderedPromise(api);
    await api.editing.resolveCustomEditor(recovered, panel, cancellation.token);
    assert.equal((await rendered).rendered, true);
    assert.equal(await cell(recovered), '50', 'Backup restores unsaved edits');
    assert.equal(recovered.dirty, true);
    await api.editing.saveCustomDocument(recovered, cancellation.token);
    assert.equal(recovered.dirty, false);
    panel.dispose(); recovered.dispose(); backup.delete();
    await vscode.commands.executeCommand('vscode.openWith', remote, 'craft.spreadsheets.preview');
    await revert(remoteDoc);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  } finally { registration.dispose(); changes.dispose(); cancellation.dispose(); }
  const draftUri = vscode.Uri.joinPath(directory, 'draft.xlsx');
  await vscode.workspace.fs.writeFile(draftUri, original);
  const draft = await open(api, draftUri);
  assert.equal(draft.dirty, false);
  await draft.request('test:draft', { row: 1, col: 1 });
  await waitFor(() => draft.dirty);
  assert.equal(await cell(draft), '42', 'Typing keeps the native draft open until commit');
  assert.ok(await vscode.workspace.save(draftUri));
  assert.equal(await cell(draft), '7', 'Save serializes the pending native cell draft');
  assert.equal(await draft.request('test:draft-text'), '7', 'Saving must preserve the active native cell draft');
  assert.equal(draft.dirty, false);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  const reopenedDraft = await open(api, draftUri);
  assert.equal(await cell(reopenedDraft), '7');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  // Real VS Code afterDelay autosave must leave cell entry and the text agent intact.
  const files = vscode.workspace.getConfiguration('files');
  const oldAutoSave = files.inspect<string>('autoSave')?.globalValue;
  const oldDelay = files.inspect<number>('autoSaveDelay')?.globalValue;
  const autoUri = vscode.Uri.joinPath(directory, 'autosave.xlsx');
  await vscode.workspace.fs.writeFile(autoUri, original);
  let auto = await open(api, autoUri);
  let finalUri = autoUri;
  try {
    await files.update('autoSaveDelay', 300, vscode.ConfigurationTarget.Global);
    await files.update('autoSave', 'afterDelay', vscode.ConfigurationTarget.Global);
    await auto.request('test:draft', { row: 1, col: 1 });
    await waitFor(() => !auto.dirty);
    assert.equal(await auto.request('test:draft-text'), '7');
    assert.equal(await auto.request('test:continue-draft', { text: '8' }), '78', 'Typing continues in the same cell after autosave');
    await waitFor(() => !auto.dirty);
    assert.equal(await cell(auto), '78');
    await auto.request('test:editor-key', { key: 'Enter' });
    await waitFor(() => !auto.dirty);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    finalUri = vscode.Uri.joinPath(directory, 'autosave-formula.xlsx');
    await vscode.workspace.fs.writeFile(finalUri, original);
    auto = await open(api, finalUri);
    const savedText = original;
    await auto.request('test:draft', { row: 1, col: 1, text: '=' });
    assert.equal(await auto.request('test:continue-draft', { text: '1+' }), '=1+');
    await new Promise(resolve => setTimeout(resolve, 1000));
    assert.equal(auto.dirty, true, 'Incomplete formula stays unsaved');
    assert.equal(await auto.request('test:draft-text'), '=1+');
    assert.deepEqual(await vscode.workspace.fs.readFile(finalUri), savedText, 'Autosave cannot overwrite the file with an unfinished formula');
    assert.equal(await auto.request('test:continue-draft', { text: '2' }), '=1+2');
    await waitFor(() => !auto.dirty);
    assert.equal(await cell(auto), '3');
    assert.equal(await auto.request('test:draft-text'), '=1+2');
    await auto.request('test:editor-key', { key: 'Enter' });
    await waitFor(() => !auto.dirty);
  } finally {
    await files.update('autoSave', oldAutoSave, vscode.ConfigurationTarget.Global);
    await files.update('autoSaveDelay', oldDelay, vscode.ConfigurationTarget.Global);
  }
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  const autoReopened = await open(api, finalUri);
  assert.equal(await cell(autoReopened), '3');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  console.log('Autosave preserves native cell input, continued typing and incomplete formulas.');
  console.log('Native editing: cell/formula round trip, Undo/Redo, Save As, Revert, failed/cancelled saves, edits during write, and backup recovery passed.');
}
async function open(api: EditorApi, uri: vscode.Uri): Promise<EditableDocument> {
  const result = renderedPromise(api);
  await vscode.commands.executeCommand('vscode.open', uri);
  const rendered = await result;
  assert.equal(rendered.rendered, true, rendered.failure);
  const doc = api.editing.getDocument(uri); assert.ok(doc); return doc;
}
function renderedPromise(api: EditorApi): Promise<RenderResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { listener.dispose(); reject(new Error('Native editor did not render')); }, 70_000);
    const listener = api.onDidRender(result => { clearTimeout(timer); listener.dispose(); resolve(result); });
  });
}
async function edit(doc: EditableDocument, text: string): Promise<unknown> {
  return doc.request('test:edit', { row: 1, col: 1, text });
}
async function cell(doc: EditableDocument, row = 1): Promise<unknown> {
  return doc.request('test:cell', { sheet: 0, row, col: 1 });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the editor lifecycle');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

async function revert(doc: EditableDocument): Promise<void> {
  const before = doc.token;
  await vscode.commands.executeCommand('workbench.action.files.revert');
  await waitFor(() => doc.token !== before && !doc.dirty);
}
