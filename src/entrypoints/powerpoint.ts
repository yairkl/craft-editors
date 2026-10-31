import * as vscode from 'vscode';
import { activateHost } from '../host';
import { EditingProvider } from '../editing';
import { registerDeckMcp } from '../document-mcp';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

export async function activate(context: vscode.ExtensionContext) {
  const probe = activateHost(context, {
    format: 'pptx', previewId: 'craft.powerpoint.preview', probeId: 'craft.powerpoint.integrationProbe',
  });
  const provider = new EditingProvider(context, { format: 'pptx', engine: 'deck', viewType: 'craft.powerpoint.preview', label: 'PowerPoint presentation' });
  context.subscriptions.push(provider, vscode.window.registerCustomEditorProvider(
    'craft.powerpoint.preview', provider, { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } },
  ));
  let mcp: Awaited<ReturnType<typeof registerDeckMcp>> | undefined;
  if (context.extensionMode !== vscode.ExtensionMode.Test || existsSync(path.join(context.extensionPath, 'media/engines/deck/node/viewer.js'))) {
    try { mcp = await registerDeckMcp(context, provider); }
    catch (error) { console.error('Craft Presentations MCP could not start:', error); void vscode.window.showWarningMessage('Craft Presentations agent tools could not start. Presentation editing remains available.'); }
  }
  return { ...probe, onDidRender: provider.onDidRender, editing: context.extensionMode === vscode.ExtensionMode.Test ? provider : undefined, mcp: context.extensionMode === vscode.ExtensionMode.Test ? mcp : undefined };
}
