import * as vscode from 'vscode';
import { activateHost } from '../host';
import { EditingProvider } from '../editing';
import { registerWordMcp } from '../document-mcp';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

export async function activate(context: vscode.ExtensionContext) {
  const probe = activateHost(context, {
    format: 'docx', previewId: 'craft.word.preview', probeId: 'craft.word.integrationProbe',
  });
  const provider = new EditingProvider(context, { format: 'docx', engine: 'word', viewType: 'craft.word.preview', label: 'Word document' });
  context.subscriptions.push(provider, vscode.window.registerCustomEditorProvider(
    'craft.word.preview', provider, { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } },
  ));
  let mcp: Awaited<ReturnType<typeof registerWordMcp>> | undefined;
  if (context.extensionMode !== vscode.ExtensionMode.Test || existsSync(path.join(context.extensionPath, 'media/engines/word/node/viewer.js'))) {
    try { mcp = await registerWordMcp(context, provider); }
    catch (error) { console.error('Craft Documents MCP could not start:', error); void vscode.window.showWarningMessage('Craft Documents agent tools could not start. Word editing remains available.'); }
  }
  return { ...probe, onDidRender: provider.onDidRender, editing: context.extensionMode === vscode.ExtensionMode.Test ? provider : undefined, mcp: context.extensionMode === vscode.ExtensionMode.Test ? mcp : undefined };
}
