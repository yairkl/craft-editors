import * as vscode from 'vscode';
import { activateHost } from '../host';
import { EditingProvider } from '../editing';
import { registerPdfMcp } from '../document-mcp';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

export async function activate(context: vscode.ExtensionContext) {
  const probe = activateHost(context, {
    format: 'pdf', previewId: 'craft.pdf.preview', probeId: 'craft.pdf.integrationProbe',
  });
  const provider = new EditingProvider(context, { format: 'pdf', engine: 'pdf', viewType: 'craft.pdf.preview', label: 'PDF' });
  context.subscriptions.push(provider, vscode.window.registerCustomEditorProvider(
    'craft.pdf.preview', provider, { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } },
  ));
  let mcp: Awaited<ReturnType<typeof registerPdfMcp>> | undefined;
  if (context.extensionMode !== vscode.ExtensionMode.Test || existsSync(path.join(context.extensionPath, 'media/engines/pdf/node/viewer.js'))) {
    try { mcp = await registerPdfMcp(context, provider); }
    catch (error) { console.error('Craft PDF MCP could not start:', error); void vscode.window.showWarningMessage('Craft PDF agent tools could not start. PDF editing remains available.'); }
  }
  return { ...probe, onDidRender: provider.onDidRender, editing: context.extensionMode === vscode.ExtensionMode.Test ? provider : undefined, mcp: context.extensionMode === vscode.ExtensionMode.Test ? mcp : undefined };
}
