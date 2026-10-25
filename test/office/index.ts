import { strict as assert } from 'node:assert';
import * as path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import * as vscode from 'vscode';
import type { EditingProvider, EditableDocument } from '../../src/editing';
import type { RenderResult } from '../../src/rendering';
import { assertIsolation, fixture, root, selected } from '../environment';
interface Api { editing: EditingProvider; onDidRender: vscode.Event<RenderResult> }
export async function run(): Promise<void> {
  assertIsolation();
  const directory = vscode.Uri.file(path.join(root!, 'artifacts/office'));
  await vscode.workspace.fs.createDirectory(directory);
  const cancellation = new vscode.CancellationTokenSource();
  for (const descriptor of selected.filter(item => item.format === 'docx' || item.format === 'pptx')) {
    const extension = vscode.extensions.getExtension<Api>(descriptor.id); assert.ok(extension);
    const api = await extension.activate(); assert.ok(api.editing);
    const original = await vscode.workspace.fs.readFile(fixture(`minimal.${descriptor.format}`));
    const uri = vscode.Uri.joinPath(directory, `roundtrip.${descriptor.format}`);
    await vscode.workspace.fs.writeFile(uri, original);
    let doc = await open(api, uri);
    const before = await doc.request('test:text'); assert.equal(typeof before, 'string');
    assert.ok(String(before).includes('Craft'));
    let after = await doc.request('test:paste', { text: 'Native edit verified ' });
    assert.ok(String(after).includes('Native edit verified'), `${descriptor.format}: native paste must edit document text`);
    assert.equal(doc.dirty, true);
    assert.deepEqual(await vscode.workspace.fs.readFile(uri), original);
    await doc.request('test:history', { redo: false });
    await waitText(doc, before);
    assert.equal(doc.dirty, false, 'Native Undo must use VS Code history and return to the clean revision');
    assert.equal(await doc.request('test:text'), before);
    await doc.request('test:history', { redo: true });
    await waitText(doc, after);
    assert.equal(await doc.request('test:text'), after);
    if (descriptor.format === 'docx') {
      const focus = await doc.request('test:focus-state') as { documentFocused: boolean; active?: string; native: { focused: boolean; hebrewGlyphs: boolean } };
      assert.equal(focus.documentFocused, true, 'Undo/Redo must retain webview focus so typing can continue');
      assert.equal(focus.native.focused, true, 'Undo/Redo must retain native document focus');
      assert.equal(focus.native.hebrewGlyphs, true, 'The bundled Word font database must render Hebrew letters and niqqud');
      const continued = await doc.request('test:type-focused', { text: 'שלום' });
      assert.ok(String(continued).includes('שלום'), `Typing Hebrew after Undo/Redo must work without a click (active ${focus.active ?? 'unknown'})`);
      after = continued;
    }
    assert.ok(await vscode.workspace.save(uri)); assert.equal(doc.dirty, false);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    doc = await open(api, uri);
    assert.equal(await doc.request('test:text'), after, 'Saved native edit survives reopening');
    await doc.request('test:paste', { text: 'Copy edit ' });
    const copyText = await doc.request('test:text');
    const disk = await vscode.workspace.fs.readFile(uri);
    const copy = vscode.Uri.joinPath(directory, `copy.${descriptor.format}`);
    await api.editing.saveCustomDocumentAs(doc, copy, cancellation.token);
    assert.deepEqual(await vscode.workspace.fs.readFile(uri), disk);
    const previous = doc.token;
    await vscode.commands.executeCommand('workbench.action.files.revert');
    await waitFor(() => doc.token !== previous);
    assert.equal(await doc.request('test:text'), after); assert.equal(doc.dirty, false);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    const copied = await open(api, copy);
    assert.equal(await copied.request('test:text'), copyText);
    await copied.request('test:paste', { text: 'Recovered edit ' });
    const recoveredText = await copied.request('test:text');
    const backup = await api.editing.backupCustomDocument(copied, { destination: vscode.Uri.joinPath(directory, `${descriptor.format}.backup`) }, cancellation.token);
    const recoveredUri = vscode.Uri.joinPath(directory, `recovered.${descriptor.format}`);
    await vscode.workspace.fs.writeFile(recoveredUri, await vscode.workspace.fs.readFile(copy));
    const recovered = await api.editing.openCustomDocument(recoveredUri, { backupId: backup.id, untitledDocumentData: undefined }, cancellation.token);
    const panel = api.editing.createRecoveryTestPanel();
    const rendered = receipt(api);
    await api.editing.resolveCustomEditor(recovered, panel, cancellation.token);
    assert.equal((await rendered).rendered, true);
    assert.equal(await recovered.request('test:text'), recoveredText); assert.equal(recovered.dirty, true);
    await api.editing.saveCustomDocument(recovered, cancellation.token); assert.equal(recovered.dirty, false);
    panel.dispose(); recovered.dispose(); backup.delete();
    await vscode.commands.executeCommand('vscode.openWith', copy, descriptor.preview);
    const old = copied.token; await vscode.commands.executeCommand('workbench.action.files.revert');
    await waitFor(() => copied.token !== old);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    if (descriptor.format === 'docx') {
      const focusUri = vscode.Uri.joinPath(directory, 'undo-focus.docx');
      await vscode.workspace.fs.writeFile(focusUri, original);
      let focusDoc = await open(api, focusUri);
      const initialText = await focusDoc.request('test:text');
      await focusDoc.request('test:paste', { text: 'Undo focus ' });
      await focusDoc.request('test:history', { redo: false });
      await waitText(focusDoc, initialText);
      assert.ok(String(await focusDoc.request('test:type-focused', { text: 'בדיקה' })).includes('בדיקה'), 'Typing after Undo needs no click');
      assert.ok(await vscode.workspace.save(focusUri));
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      focusDoc = await open(api, focusUri);
      assert.ok(String(await focusDoc.request('test:text')).includes('בדיקה'));
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      const hebrew = await open(api, fixture('hebrew.docx'));
      assert.ok(String(await hebrew.request('test:text')).includes('שָׁלוֹם'));
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
    console.log(`Native ${descriptor.format}: input, undo/redo, Save/reopen, Save As, Revert and recovery passed.`);
  }
  cancellation.dispose();
}
function receipt(api: Api): Promise<RenderResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { listener.dispose(); reject(new Error('Editor did not render')); }, 70_000);
    const listener = api.onDidRender(result => { clearTimeout(timer); listener.dispose(); resolve(result); });
  });
}
async function open(api: Api, uri: vscode.Uri): Promise<EditableDocument> {
  const rendered = receipt(api); await vscode.commands.executeCommand('vscode.open', uri);
  const result = await rendered; assert.equal(result.rendered, true, result.failure);
  assert.ok(result.nonBackgroundPixels > 100);
  if (result.screenshot) {
    const directory = path.join(root!, 'artifacts/rendering'); await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `native.${result.format}.png`), Buffer.from(result.screenshot.split(',')[1]!, 'base64'));
  }
  const doc = api.editing.getDocument(uri); assert.ok(doc); return doc;
}
async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Editor lifecycle timed out'); await new Promise(resolve => setTimeout(resolve, 25)); }
}

async function waitText(doc: EditableDocument, expected: unknown): Promise<void> {
  const deadline = Date.now() + 5000;
  while (await doc.request('test:text') !== expected) {
    if (Date.now() > deadline) throw new Error('Native history keyboard shortcut failed');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
