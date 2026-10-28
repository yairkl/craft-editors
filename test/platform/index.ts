import { spawn } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { EditableDocument, EditingProvider } from '../../src/editing';
import type { RenderResult } from '../../src/rendering';
import { assertIsolation, fixture, root, selected } from '../environment';
import { press } from '../support/native-keyboard';

interface Api { editing: EditingProvider; onDidRender: vscode.Event<RenderResult>; mcp?: { command: string; args: string[]; env: Record<string, string> } }

function agent(config: NonNullable<Api['mcp']>) {
  const child = spawn(config.command, config.args, { env: { ...process.env, ...config.env }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const lines = createInterface({ input: child.stdout });
  type Response = { result?: { isError?: boolean; content?: { text?: string }[] }; error?: { message?: string } };
  const pending = new Map<number, { resolve(value: Response): void; reject(error: Error): void }>();
  let id = 0;
  lines.on('line', line => { const value = JSON.parse(line) as Response & { id: number }; const entry = pending.get(value.id); if (entry) { pending.delete(value.id); entry.resolve(value); } });
  child.on('error', error => { for (const entry of pending.values()) entry.reject(error); pending.clear(); });
  child.on('exit', () => { for (const entry of pending.values()) entry.reject(new Error('Agent proxy exited')); pending.clear(); });
  return {
    call(method: string, params: object): Promise<Response> {
      const next = ++id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(next); reject(new Error(`Agent ${method} timed out`)); }, 15000);
        pending.set(next, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: next, method, params }) + '\n');
      });
    },
    close(): void { child.stdin.end(); },
  };
}


async function waitFor(predicate: () => Promise<boolean>, label: string): Promise<void> {
  const deadline = Date.now() + 8000;
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label} on ${process.platform}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

async function open(api: Api, uri: vscode.Uri, view: string): Promise<EditableDocument> {
  const rendered = new Promise<RenderResult>((resolve, reject) => {
    const timeout = setTimeout(() => { listener.dispose(); reject(new Error('Editor did not render')); }, 70000);
    const listener = api.onDidRender(result => { clearTimeout(timeout); listener.dispose(); resolve(result); });
  });
  await vscode.commands.executeCommand('vscode.openWith', uri, view);
  const frame = await rendered;
  assert.equal(frame.rendered, true, frame.failure);
  if (frame.screenshot) {
    await writeFile(path.join(root!, 'artifacts/platform', `${path.basename(uri.fsPath)}.png`), Buffer.from(frame.screenshot.split(',')[1]!, 'base64'));
  }
  const doc = api.editing.getDocument(uri); assert.ok(doc); return doc;
}

export async function run(): Promise<void> {
  assertIsolation();
  const directory = vscode.Uri.file(path.join(root!, 'artifacts/platform'));
  await vscode.workspace.fs.createDirectory(directory);
  const themeConfig = vscode.workspace.getConfiguration('workbench');
  const previousTheme = themeConfig.inspect<string>('colorTheme')?.globalValue;
  const previousClipboard = await vscode.env.clipboard.readText();
  try {
    for (const item of selected) {
      const extension = vscode.extensions.getExtension<Api>(item.id); assert.ok(extension);
      const api = await extension.activate();
      const uri = vscode.Uri.joinPath(directory, `smoke.${item.format}`);
      await vscode.workspace.fs.writeFile(uri, await vscode.workspace.fs.readFile(fixture(`minimal.${item.format}`)));
      let doc = await open(api, uri, item.preview);
      assert.equal(doc.dirty, false);
      assert.equal((await doc.request('test:inspect') as { hebrewGlyphs: boolean }).hebrewGlyphs, true, `${item.format} Hebrew font coverage`);
      if (item.format === 'xlsx') {
        await doc.request('test:edit', { row: 5, col: 1, text: 'platform copy' });
        await vscode.env.clipboard.writeText('previous clipboard');
        press('c');
        await waitFor(async () => (await vscode.env.clipboard.readText()).trim() === 'platform copy', 'native copy');
        await doc.request('test:edit', { row: 6, col: 1, text: 'destination' });
        press('v');
        await waitFor(async () => await doc.request('test:cell', { sheet: 0, row: 6, col: 1 }) === 'platform copy', 'native paste');
        const before = api.editing.testUndoRequests;
        press('z');
        await waitFor(async () => await doc.request('test:cell', { sheet: 0, row: 6, col: 1 }) === 'destination', 'single native undo');
        await new Promise(resolve => setTimeout(resolve, 250));
        assert.equal(api.editing.testUndoRequests, before, 'Native undo must not be requested again by the embedded editor');
      } else if (item.format === 'docx' || item.format === 'pptx') {
        assert.ok(String(await doc.request('test:paste', { text: 'Platform smoke ' })).includes('Platform smoke'));
      } else {
        await doc.request('test:command', item.format === 'pdf'
          ? { command: 'page.rotate', params: {} }
          : { command: 'shape.rectangle', params: { x: 310, y: 260, width: 77, height: 55 } });
      }
      await waitFor(async () => doc.dirty, `${item.format} dirty state`);
      const beforeUndo = doc.token;
      const beforeRequests = api.editing.testUndoRequests;
      press('z');
      await waitFor(async () => doc.token !== beforeUndo, `${item.format} undo`);
      await new Promise(resolve => setTimeout(resolve, 250));
      assert.equal(api.editing.testUndoRequests, beforeRequests, `${item.format} shortcut must trigger undo once`);
      const afterUndo = doc.token;
      const beforeRedoRequests = api.editing.testRedoRequests;
      press('redo');
      await waitFor(async () => doc.token !== afterUndo && doc.dirty, `${item.format} redo`);
      await new Promise(resolve => setTimeout(resolve, 250));
      assert.equal(api.editing.testRedoRequests, beforeRedoRequests, `${item.format} shortcut must trigger redo once`);
      assert.ok(await vscode.workspace.save(uri), `${item.format} save`);
      assert.equal(doc.dirty, false);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      doc = await open(api, uri, item.preview);
      assert.equal(doc.dirty, false);
      if (item.format === 'xlsx') assert.equal(await doc.request('test:cell', { sheet: 0, row: 5, col: 1 }), 'platform copy');
      if (item.format === 'docx' || item.format === 'pptx') assert.ok(String(await doc.request('test:text')).includes('Platform smoke'));
      if (item.format === 'pdf') assert.equal((await doc.request('test:inspect') as { rotations: number[] }).rotations[0], 90);
      if (item.format === 'svg') assert.ok(String(await doc.request('test:text')).includes('77'), 'SVG shape survives save/reopen');
      await themeConfig.update('colorTheme', 'Default Light Modern', vscode.ConfigurationTarget.Global);
      await waitFor(async () => await doc.request('test:theme') === false, `${item.format} light theme`);
      await themeConfig.update('colorTheme', 'Default Dark Modern', vscode.ConfigurationTarget.Global);
      await waitFor(async () => await doc.request('test:theme') === true, `${item.format} dark theme`);
      assert.equal(doc.dirty, false, 'Theme changes must not dirty the document');
      assert.equal(await doc.request('test:host-shortcut'), true, 'Host shortcut listener must receive key events');
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      if (item.format === 'xlsx') {
        assert.ok(api.mcp);
        const client = agent(api.mcp);
        const tool = (name: string, args: object) => client.call('tools/call', { name, arguments: args });
        try {
          assert.ok((await client.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'platform-smoke', version: '1' } })).result);
          assert.equal((await tool('open_workbook', { path: uri.fsPath })).result?.isError, false);
          assert.equal((await tool('set_cell', { cell: 'A8', input: 'agent platform smoke' })).result?.isError, false);
          assert.equal((await tool('save_workbook', {})).result?.isError, false);
        } finally { client.close(); }
        doc = await open(api, uri, item.preview);
        assert.equal(await doc.request('test:cell', { sheet: 0, row: 7, col: 0 }), 'agent platform smoke');
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        const csv = vscode.Uri.joinPath(directory, 'platform.csv');
        await vscode.workspace.fs.writeFile(csv, new TextEncoder().encode('Name;Value\r\n"quoted, name";42\r\n'));
        doc = await open(api, csv, item.preview);
        assert.equal(await doc.request('test:cell', { sheet: 0, row: 1, col: 0 }), 'quoted, name');
        await doc.request('test:edit', { row: 1, col: 1, text: 'שלום, "CSV"' });
        assert.ok(await vscode.workspace.save(csv));
        const csvText = new TextDecoder().decode(await vscode.workspace.fs.readFile(csv));
        assert.ok(csvText.startsWith('Name;Value'), 'CSV delimiter survives saving');
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        doc = await open(api, csv, item.preview);
        assert.equal(await doc.request('test:cell', { sheet: 0, row: 1, col: 1 }), 'שלום, "CSV"');
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }
      console.log(`Platform smoke passed: ${process.platform} ${item.format}`);
    }
  } finally {
    await vscode.env.clipboard.writeText(previousClipboard);
    await themeConfig.update('colorTheme', previousTheme, vscode.ConfigurationTarget.Global);
  }
}
