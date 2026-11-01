import { strict as assert } from 'node:assert';
import * as path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import * as vscode from 'vscode';
import type { EditingProvider, EditableDocument } from '../../src/editing';
import type { RenderResult } from '../../src/rendering';
import { assertIsolation, fixture, root, selected } from '../environment';
import { press } from '../support/native-keyboard';
interface Api { editing: EditingProvider; onDidRender: vscode.Event<RenderResult>; mcp?: { command: string; args: string[]; env: Record<string, string> } }
export async function run(): Promise<void> {
  assertIsolation();
  const directory = vscode.Uri.file(path.join(root!, 'artifacts/office'));
  await vscode.workspace.fs.createDirectory(directory);
  const cancellation = new vscode.CancellationTokenSource();
  for (const descriptor of selected.filter(item => item.format === 'docx' || item.format === 'pptx')) {
    const extension = vscode.extensions.getExtension<Api>(descriptor.id); assert.ok(extension);
    const api = await extension.activate(); assert.ok(api.editing);
    if (descriptor.format === 'docx') await checkMarkdown(api, directory, cancellation.token);
    const original = await vscode.workspace.fs.readFile(fixture(`minimal.${descriptor.format}`));
    const uri = vscode.Uri.joinPath(directory, `roundtrip.${descriptor.format}`);
    await vscode.workspace.fs.writeFile(uri, original);
    let doc = await open(api, uri);
    if (descriptor.format === 'pptx') {
      assert.ok(api.mcp);
      const client = agent(api.mcp);
      const tool = (name: string, args: object) => client('tools/call', { name, arguments: args });
      assert.equal((await tool('open_presentation', { path: uri.fsPath })).isError, false);
      const initial = await doc.request('test:text');
      assert.equal((await tool('add_text_box', { x: 20, y: 20, w: 200, h: 40, text: 'live slide agent' })).isError, false);
      assert.ok(String(await doc.request('test:text')).includes('live slide agent'));
      await waitFor(() => doc.dirty);
      assert.equal((await tool('run_command', { command: 'edit.undo' })).isError, false);
      assert.equal(await doc.request('test:text'), initial);
      client.close();
      const closedUri = vscode.Uri.joinPath(directory, 'agent-closed.pptx');
      await vscode.workspace.fs.writeFile(closedUri, original);
      const closed = agent(api.mcp);
      const closedTool = (name: string, args: object) => closed('tools/call', { name, arguments: args });
      assert.equal((await closedTool('open_presentation', { path: closedUri.fsPath })).isError, false);
      assert.equal((await closedTool('add_text_box', { x: 20, y: 20, w: 200, h: 40, text: 'closed slide agent' })).isError, false);
      assert.deepEqual(await vscode.workspace.fs.readFile(closedUri), original);
      assert.equal((await closedTool('save_presentation', {})).isError, false);
      const savedDeck = await closedTool('inspect_document', {});
      assert.equal((JSON.parse(savedDeck.content?.[0]?.text ?? '{}') as { dirty: boolean }).dirty, false);
      closed.close();
      const closedDoc = await open(api, closedUri);
      assert.ok(String(await closedDoc.request('test:text')).includes('closed slide agent'));
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await vscode.commands.executeCommand('vscode.openWith', uri, descriptor.preview);
    }
    if (descriptor.format === 'docx') {
      assert.ok(api.mcp);
      const client = agent(api.mcp);
      const tool = (name: string, args: object) => client('tools/call', { name, arguments: args });
      assert.equal((await tool('open_document', { path: uri.fsPath })).isError, false);
      const initial = await doc.request('test:text');
      assert.equal((await tool('type_text', { text: 'live agent ' })).isError, false);
      assert.ok(String(await doc.request('test:text')).includes('live agent'));
      await waitFor(() => doc.dirty);
      assert.equal((await tool('execute', { command: 'edit.undo' })).isError, false);
      assert.equal(await doc.request('test:text'), initial);
      client.close();
      const closedUri = vscode.Uri.joinPath(directory, 'agent-closed.docx');
      await vscode.workspace.fs.writeFile(closedUri, original);
      const closed = agent(api.mcp);
      const closedTool = (name: string, args: object) => closed('tools/call', { name, arguments: args });
      assert.equal((await closedTool('open_document', { path: closedUri.fsPath })).isError, false);
      assert.equal((await closedTool('type_text', { text: 'closed agent ' })).isError, false);
      assert.deepEqual(await vscode.workspace.fs.readFile(closedUri), original);
      const existingCopy = vscode.Uri.joinPath(directory, 'agent-existing.docx');
      const existingBytes = Buffer.from('existing destination');
      await vscode.workspace.fs.writeFile(existingCopy, existingBytes);
      assert.equal((await closedTool('save_document', { path: existingCopy.fsPath })).isError, true, 'A document copy must not overwrite an existing file');
      assert.deepEqual(await vscode.workspace.fs.readFile(existingCopy), existingBytes);
      const external = Buffer.from('external change');
      await vscode.workspace.fs.writeFile(closedUri, external);
      assert.equal((await closedTool('save_document', {})).isError, true, 'Headless save must not overwrite an external change');
      assert.deepEqual(await vscode.workspace.fs.readFile(closedUri), external);
      await vscode.workspace.fs.writeFile(closedUri, original);
      assert.equal((await closedTool('save_document', {})).isError, false);
      closed.close();
      const closedDoc = await open(api, closedUri);
      assert.ok(String(await closedDoc.request('test:text')).includes('closed agent'));
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await vscode.commands.executeCommand('vscode.openWith', uri, descriptor.preview);
    }
    if (descriptor.format === 'pptx') {
      await doc.request('test:command', { command: 'show.start' });
      const state = await doc.request('test:inspect') as { show: unknown };
      assert.equal(state.show, null, 'Embedded slideshow must not open a presenter window over the audience slide');
      await doc.request('test:editor-key', { key: 'F5' });
      assert.equal((await doc.request('test:inspect') as { show: unknown }).show, null, 'F5 cannot bypass the embedded presentation restriction');
      await doc.request('test:command', { command: 'show.presenter', params: { on: true } });
      await doc.request('test:command', { command: 'view.reading' });
      const reading = await doc.request('test:inspect') as { show: { reading: boolean; presenter: boolean } };
      assert.equal(reading.show.reading, true, 'In-editor Reading View remains available');
      assert.equal(reading.show.presenter, false, 'Reading View cannot create an overlapping presenter window');
      assert.equal(doc.dirty, false, 'Presentation/view controls must not modify the file');
      await doc.request('test:command', { command: 'show.end' });
      await doc.request('test:command', { command: 'show.customShow', params: { name: 'Custom show', slides: [0] } });
      await waitFor(() => doc.dirty);
      await doc.request('test:command', { command: 'show.start', params: { custom: 'Custom show' } });
      assert.equal((await doc.request('test:inspect') as { show: unknown }).show, null, 'A valid custom slideshow cannot bypass the embedded presentation restriction');
      await api.editing.revertCustomDocument(doc, cancellation.token);
    }
    const before = await doc.request('test:text'); assert.equal(typeof before, 'string');
    assert.ok(String(before).includes('Craft'));
    let after = await doc.request('test:paste', { text: 'Native edit verified ' });
    assert.ok(String(after).includes('Native edit verified'), `${descriptor.format}: native paste must edit document text`);
    assert.equal(doc.dirty, true);
    assert.deepEqual(await vscode.workspace.fs.readFile(uri), original);
    assert.equal(await doc.request('test:focus-canvas'), true); press('z');
    await waitText(doc, before);
    assert.equal(doc.dirty, false, 'Native Undo must use VS Code history and return to the clean revision');
    assert.equal(await doc.request('test:text'), before);
    assert.equal(await doc.request('test:focus-canvas'), true); press('redo');
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
    assert.equal(await recovered.request('test:host-shortcut'), true, 'Keyboard events must reach the host keybinding listener');
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
      assert.equal(await focusDoc.request('test:focus-canvas'), true); press('z');
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
async function checkMarkdown(api: Api, directory: vscode.Uri, token: vscode.CancellationToken): Promise<void> {
  const uri = vscode.Uri.joinPath(directory, 'roundtrip.md');
  const source = Buffer.from('# Craft title\n\nA **bold** [link](https://example.com).\n');
  await vscode.workspace.fs.writeFile(uri, source);
  await vscode.commands.executeCommand('vscode.open', uri);
  assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), uri.toString(), 'Markdown remains in the text editor by default');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  const openMarkdown = async () => {
    const rendered = receipt(api);
    await vscode.commands.executeCommand('vscode.openWith', uri, 'craft.word.markdown');
    const result = await rendered; assert.equal(result.rendered, true, result.failure);
    const doc = api.editing.getDocument(uri); assert.ok(doc); return doc;
  };
  let md = await openMarkdown();
  assert.equal(await md.request('test:markdown-safe'), true, 'Simple Markdown can be saved without loss');
  await md.request('test:paste', { text: 'Edit ' });
  await waitFor(() => md.dirty);
  assert.equal(await md.request('test:markdown-safe'), true, 'Ordinary edits remain representable in Markdown');
  await api.editing.saveCustomDocument(md, token);
  assert.ok(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString().includes('Edit '));
  await vscode.commands.executeCommand('craft.word.openMarkdownText');
  assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), uri.toString());
  const rendered = receipt(api);
  await vscode.commands.executeCommand('craft.word.openMarkdownDocument');
  assert.equal((await rendered).rendered, true);
  md = api.editing.getDocument(uri)!; assert.ok(md);
  const savedMarkdown = await vscode.workspace.fs.readFile(uri);
  await md.request('test:command', { command: 'select.all' });
  await md.request('test:command', { command: 'format.color', params: { color: 'FF0000' } });
  await waitFor(() => md.dirty);
  assert.equal(await md.request('test:markdown-safe'), false, 'Color formatting cannot be represented by Markdown');
  await assert.rejects(api.editing.saveCustomDocument(md, token));
  assert.deepEqual(await vscode.workspace.fs.readFile(uri), savedMarkdown);
  await api.editing.revertCustomDocument(md, token);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  const unsupported = Buffer.from('# Craft drawing\n\n![alt](relative-image.png)\n');
  await vscode.workspace.fs.writeFile(uri, unsupported);
  md = await openMarkdown();
  assert.equal(await md.request('test:markdown-safe'), false, 'An unsupported image reference cannot be silently overwritten');
  await md.request('test:paste', { text: 'Edit ' });
  await waitFor(() => md.dirty);
  await assert.rejects(api.editing.saveCustomDocument(md, token));
  assert.deepEqual(await vscode.workspace.fs.readFile(uri), unsupported);
  const copy = vscode.Uri.joinPath(directory, 'markdown-copy.docx');
  await api.editing.saveCustomDocumentAs(md, copy, token);
  assert.equal(Buffer.from(await vscode.workspace.fs.readFile(copy)).subarray(0, 2).toString(), 'PK');
  const backupUri = vscode.Uri.joinPath(directory, 'markdown.backup');
  const expectedText = await md.request('test:text');
  const backup = await api.editing.backupCustomDocument(md, { destination: backupUri }, token);
  const recoveredUri = vscode.Uri.joinPath(directory, 'recovered.md');
  await vscode.workspace.fs.writeFile(recoveredUri, unsupported);
  const recovered = await api.editing.openCustomDocument(recoveredUri, { backupId: backup.id, untitledDocumentData: undefined }, token);
  const panel = api.editing.createRecoveryTestPanel();
  const recoveryRender = receipt(api);
  await api.editing.resolveCustomEditor(recovered, panel, token);
  assert.equal((await recoveryRender).rendered, true, 'A DOCX snapshot recovers inside the Markdown editor');
  assert.equal(await recovered.request('test:text'), expectedText, 'Recovery retains the unsaved edit');
  assert.equal(await recovered.request('test:markdown-safe'), false, 'Recovery retains the unsafe-source protection');
  assert.equal(recovered.dirty, true);
  panel.dispose(); recovered.dispose();
  await api.editing.revertCustomDocument(md, token);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  backup.delete();
  const frontMatter = Buffer.from('---\ntitle: Craft\n---\n\nCraft text\n');
  await vscode.workspace.fs.writeFile(uri, frontMatter);
  md = await openMarkdown();
  assert.equal(await md.request('test:markdown-safe'), false, 'Front matter cannot be silently reinterpreted');
  await md.request('test:paste', { text: 'Edit ' });
  await waitFor(() => md.dirty);
  await assert.rejects(api.editing.saveCustomDocument(md, token));
  assert.deepEqual(await vscode.workspace.fs.readFile(uri), frontMatter);
  await api.editing.revertCustomDocument(md, token);
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  console.log('Markdown text switching, safe save, unsupported source protection, DOCX copy and backup passed.');
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

function agent(config: NonNullable<Api['mcp']>) {
  const child = spawn(config.command, config.args, { env: { ...process.env, ...config.env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  type Reply = { isError?: boolean; content?: { text?: string }[] };
  const pending = new Map<number, { resolve(value: Reply): void; reject(error: Error): void }>();
  let sequence = 0;
  lines.on('line', line => { const response = JSON.parse(line) as { id: number; result: Reply }; const waiter = pending.get(response.id); if (waiter) { pending.delete(response.id); waiter.resolve(response.result); } });
  child.on('exit', () => { for (const waiter of pending.values()) waiter.reject(new Error('MCP proxy exited')); pending.clear(); });
  const call = (method: string, params: object): Promise<Reply> => new Promise((resolve, reject) => {
    const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error('MCP request timed out')); }, 15000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  return Object.assign(call, { close: () => child.stdin.end() });
}
