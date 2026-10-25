import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { EditingProvider } from '../../src/editing';
import type { RenderResult } from '../../src/rendering';
import { assertIsolation, fixture, root, selected } from '../environment';
interface Api { editing: EditingProvider; onDidRender: vscode.Event<RenderResult> }
interface State { zoom: number; draft?: string; rotations?: number[] }
export async function run(): Promise<void> {
  assertIsolation();
  const directory = vscode.Uri.file(path.join(root!, 'artifacts/graphics'));
  await vscode.workspace.fs.createDirectory(directory);
  const cancellation = new vscode.CancellationTokenSource();
  for (const descriptor of selected.filter(d => ['pdf', 'svg'].includes(d.format))) {
    const extension = vscode.extensions.getExtension<Api>(descriptor.id); assert.ok(extension);
    const api = await extension.activate(); assert.ok(api.editing);
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
      await doc.request('test:command', { command: 'create.blank' });
      assert.equal(doc.dirty, false, 'Unsupported multi-document workflows cannot replace the host document');
    }
    const initial = await doc.request('test:inspect') as State;
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
      const native = await open(nativeUri);
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
