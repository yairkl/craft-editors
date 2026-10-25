import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
import type { RenderResult } from '../../src/rendering';
import { assertIsolation, fixture, selected } from '../environment';

interface RenderingApi { onDidRender: vscode.Event<RenderResult> }

export async function run(): Promise<void> {
  assertIsolation();
  assert.equal(Boolean(vscode.extensions.getExtension('craft-vscode-dev.craft-suite')), process.env.CRAFT_TEST_SUITE === 'true');
  for (const descriptor of selected) {
    const extension = vscode.extensions.getExtension<RenderingApi>(descriptor.id);
    assert.ok(extension, 'The installed VSIX must be discoverable');
    const api = await extension.activate();
    let listener: vscode.Disposable | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const receipt = new Promise<RenderResult>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Installed ${descriptor.id} did not render`)), 70_000);
      listener = api.onDidRender(resolve);
    });
    void receipt.catch(() => {});
    const uri = fixture(`minimal.${descriptor.format}`);
    const before = await vscode.workspace.fs.readFile(uri);
    try {
      await vscode.commands.executeCommand('vscode.open', uri);
      const result = await receipt;
      assert.equal(result.rendered, true);
      assert.ok(result.nonBackgroundPixels > 100);
      assert.equal(result.screenshot, undefined, 'Production mode must not capture screenshots');
      const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
      assert.ok(input instanceof vscode.TabInputCustom && input.viewType === descriptor.preview);
      assert.deepEqual(await vscode.workspace.fs.readFile(uri), before);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      console.log(`Installed VSIX verified: ${descriptor.id}, normal file open, real rendering, no source writes.`);
    } finally { clearTimeout(timer); listener?.dispose(); }
  }
}
