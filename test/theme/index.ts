import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { EditingProvider, EditableDocument } from '../../src/editing';
import type { RenderResult } from '../../src/rendering';
import { assertIsolation, fixture, root, selected } from '../environment';
interface Api { editing: EditingProvider; onDidRender: vscode.Event<RenderResult> }
export async function run(): Promise<void> {
  assertIsolation();
  const config = vscode.workspace.getConfiguration('workbench');
  const previous = config.inspect<string>('colorTheme')?.globalValue;
  const themes = [['Default Light Modern', false], ['Default Dark Modern', true],
    ['Default High Contrast Light', false], ['Default High Contrast', true]] as const;
  const cancellation = new vscode.CancellationTokenSource();
  try {
    await config.update('colorTheme', 'Default Dark Modern', vscode.ConfigurationTarget.Global);
    for (const descriptor of selected) {
      const extension = vscode.extensions.getExtension<Api>(descriptor.id); assert.ok(extension);
      const api = await extension.activate();
      const uri = fixture(`minimal.${descriptor.format}`);
      const bytes = await vscode.workspace.fs.readFile(uri);
      const rendered = receipt(api); await vscode.commands.executeCommand(descriptor.format === 'svg' ? 'vscode.openWith' : 'vscode.open', uri, ...(descriptor.format === 'svg' ? [descriptor.preview] : []));
      const frame = await rendered; assert.equal(frame.rendered, true);
      if (frame.screenshot) {
        const directory = path.join(root!, 'artifacts/rendering'); await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, `theme-dark.${descriptor.format}.png`), Buffer.from(frame.screenshot.split(',')[1]!, 'base64'));
      }
      const doc = api.editing.getDocument(uri); assert.ok(doc);
      await palette(doc, true); // Initial theme, not just later changes.
      const token = doc.token;
      for (const [theme, dark] of themes) {
        console.log(`${descriptor.format}: switching to ${theme}`);
        await config.update('colorTheme', theme, vscode.ConfigurationTarget.Global);
        await palette(doc, dark);
        assert.equal(doc.token, token, 'Theme changes cannot create document edits');
        assert.equal(doc.dirty, false);
      }
      await api.editing.revertCustomDocument(doc, cancellation.token);
      await palette(doc, true); // Reconstructing the native app must retain its theme.
      if (descriptor.format === 'xlsx') {
        await doc.request('test:draft', { row: 1, col: 1 });
        const draftToken = doc.token;
        await config.update('colorTheme', 'Default Light Modern', vscode.ConfigurationTarget.Global);
        await palette(doc, false);
        assert.equal(await doc.request('test:draft-text'), '7', 'Theme changes must preserve cell entry');
        assert.equal(doc.token, draftToken);
        await api.editing.revertCustomDocument(doc, cancellation.token);
        // Ask VS Code to clear the actual custom-document edit history too.
        const before = doc.token;
        await vscode.commands.executeCommand('workbench.action.files.revert');
        await waitFor(async () => doc.token !== before && !doc.dirty);
      }
      assert.deepEqual(await vscode.workspace.fs.readFile(uri), bytes);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await config.update('colorTheme', 'Default Dark Modern', vscode.ConfigurationTarget.Global);
      console.log(`${descriptor.format}: initial/live light, dark, high-contrast mapping and Revert theme persistence passed.`);
    }
  } finally {
    cancellation.dispose();
    await config.update('colorTheme', previous, vscode.ConfigurationTarget.Global);
  }
}
async function palette(doc: EditableDocument, expected: boolean): Promise<void> {
  try { await waitFor(async () => await doc.request('test:theme') === expected); }
  catch { throw new Error(JSON.stringify(await doc.request('test:theme-details'))); }
}
async function waitFor(condition: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 7000;
  while (!await condition()) {
    if (Date.now() > deadline) throw new Error('Native palette did not follow VS Code theme');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
function receipt(api: Api): Promise<RenderResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { listener.dispose(); reject(new Error('Editor did not render')); }, 70_000);
    const listener = api.onDidRender(value => { clearTimeout(timer); listener.dispose(); resolve(value); });
  });
}
