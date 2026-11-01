import * as vscode from 'vscode';
import { activateHost } from '../host';
import { EditingProvider } from '../editing';
import { registerVectorMcp } from '../document-mcp';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

export async function activate(context: vscode.ExtensionContext) {
  const probe = activateHost(context, {
    format: 'svg', previewId: 'craft.vector.preview', probeId: 'craft.vector.integrationProbe',
  });
  const provider = new EditingProvider(context, { format: 'svg', engine: 'vector', viewType: 'craft.vector.preview', label: 'Vector drawing', additionalFormats: ['vectorcraft'] });
  context.subscriptions.push(
    vscode.commands.registerCommand('craft.vector.openSvgText', () => vscode.commands.executeCommand('workbench.action.reopenTextEditor')),
    vscode.commands.registerCommand('craft.vector.openSvgDrawing', () => vscode.commands.executeCommand('reopenActiveEditorWith', 'craft.vector.preview')),
  );
  context.subscriptions.push(provider, vscode.window.registerCustomEditorProvider(
    'craft.vector.preview', provider, { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } },
  ));
  let mcp: Awaited<ReturnType<typeof registerVectorMcp>> | undefined;
  if (context.extensionMode !== vscode.ExtensionMode.Test || existsSync(path.join(context.extensionPath, 'media/engines/vector/node/viewer.js'))) {
    try { mcp = await registerVectorMcp(context, provider); }
    catch (error) { console.error('Craft Vector MCP could not start:', error); void vscode.window.showWarningMessage('Craft Vector agent tools could not start. Vector editing remains available.'); }
  }
  return { ...probe, onDidRender: provider.onDidRender, editing: context.extensionMode === vscode.ExtensionMode.Test ? provider : undefined, mcp: context.extensionMode === vscode.ExtensionMode.Test ? mcp : undefined };
}
