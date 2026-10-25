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
  const directory = vscode.Uri.file(path.join(root!, 'artifacts/languages'));
  await vscode.workspace.fs.createDirectory(directory);
  for (const descriptor of selected) {
    const extension = vscode.extensions.getExtension<Api>(descriptor.id); assert.ok(extension);
    const api = await extension.activate(); assert.ok(api.editing);
    const uri = vscode.Uri.joinPath(directory, `hebrew.${descriptor.format}`);
    await vscode.workspace.fs.writeFile(uri, await vscode.workspace.fs.readFile(fixture(`minimal.${descriptor.format}`)));
    const open = async (): Promise<EditableDocument> => {
      const receipt = new Promise<RenderResult>((resolve, reject) => {
        const timer = setTimeout(() => { listener.dispose(); reject(new Error('Language fixture did not render')); }, 70000);
        const listener = api.onDidRender(frame => { clearTimeout(timer); listener.dispose(); resolve(frame); });
      });
      await vscode.commands.executeCommand('vscode.openWith', uri, descriptor.preview);
      const frame = await receipt; assert.equal(frame.rendered, true, frame.failure);
      if (frame.screenshot) {
        const output = path.join(root!, 'artifacts/rendering'); await mkdir(output, { recursive: true });
        await writeFile(path.join(output, `hebrew.${descriptor.format}.png`), Buffer.from(frame.screenshot.split(',')[1]!, 'base64'));
      }
      const doc = api.editing.getDocument(uri); assert.ok(doc); return doc;
    };
    let doc = await open();
    const coverage = await doc.request('test:inspect') as { hebrewGlyphs: boolean; uiHebrewGlyphs?: boolean };
    assert.equal(coverage.hebrewGlyphs, true, `${descriptor.format}: native document Hebrew fallback`);
    if (descriptor.format !== 'xlsx') assert.equal(coverage.uiHebrewGlyphs, true, 'Native UI fallback');
    const text = 'שָׁלוֹם עולם';
    if (descriptor.format === 'xlsx') await doc.request('test:edit', { row: 5, col: 0, text });
    else if (descriptor.format === 'svg') await doc.request('test:command', { command: 'text.create', params: { x: 550, y: 280, text, size: 28 } });
    else if (descriptor.format === 'pdf') { await doc.request('test:pdf-draft', { text }); await doc.request('test:commit'); }
    else await doc.request('test:paste', { text });
    assert.ok(await vscode.workspace.save(uri));
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    doc = await open();
    const saved = descriptor.format === 'xlsx' ? await doc.request('test:cell', { sheet: 0, row: 5, col: 0 }) : await doc.request('test:text');
    assert.ok(String(saved).includes(text), `${descriptor.format}: Hebrew and niqqud survive save/reopen`);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    console.log(`${descriptor.format}: bundled Hebrew glyphs, native edit and saved-file reopen passed.`);
  }
}
