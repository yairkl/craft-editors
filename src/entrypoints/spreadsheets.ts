import * as vscode from 'vscode';
import { activateHost } from '../host';
import { EditingProvider } from '../editing';
import { registerWorkbookMcp } from '../mcp';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

export async function activate(context: vscode.ExtensionContext) {
  const probe = activateHost(context, {
    format: 'xlsx', previewId: 'craft.spreadsheets.preview', probeId: 'craft.spreadsheets.integrationProbe',
  });
  const provider = new EditingProvider(context, { format: 'xlsx', additionalFormats: ['csv'], engine: 'grid', viewType: 'craft.spreadsheets.preview', label: 'Spreadsheet' });
  context.subscriptions.push(vscode.commands.registerCommand('craft.spreadsheets.saveAsWorkbook', () => provider.saveCsvAsWorkbook()));
  context.subscriptions.push(provider, vscode.window.registerCustomEditorProvider(
    'craft.spreadsheets.preview', provider, { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } },
  ));
  const missingTestRenderer = context.extensionMode === vscode.ExtensionMode.Test && !existsSync(path.join(context.extensionPath, 'media/engines/grid/node/viewer.js'));
  let mcp: Awaited<ReturnType<typeof registerWorkbookMcp>> | undefined;
  if (!missingTestRenderer) {
    try { mcp = await registerWorkbookMcp(context, provider); }
    catch (error) {
      console.error('Craft Spreadsheets MCP could not start:', error);
      void vscode.window.showWarningMessage('Craft Spreadsheets agent tools could not start. Spreadsheet editing remains available.');
    }
  }
  return { ...probe, onDidRender: provider.onDidRender, editing: context.extensionMode === vscode.ExtensionMode.Test ? provider : undefined, mcp: context.extensionMode === vscode.ExtensionMode.Test ? mcp : undefined };
}
