import * as vscode from 'vscode';
import { activateHost } from '../host';
import { EditingProvider } from '../editing';

export function activate(context: vscode.ExtensionContext) {
  const probe = activateHost(context, {
    format: 'xlsx', previewId: 'craft.spreadsheets.preview', probeId: 'craft.spreadsheets.integrationProbe',
  });
  const provider = new EditingProvider(context, { format: 'xlsx', additionalFormats: ['csv'], engine: 'grid', viewType: 'craft.spreadsheets.preview', label: 'Spreadsheet' });
  context.subscriptions.push(vscode.commands.registerCommand('craft.spreadsheets.saveAsWorkbook', () => provider.saveCsvAsWorkbook()));
  context.subscriptions.push(provider, vscode.window.registerCustomEditorProvider(
    'craft.spreadsheets.preview', provider, { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } },
  ));
  return { ...probe, onDidRender: provider.onDidRender, editing: context.extensionMode === vscode.ExtensionMode.Test ? provider : undefined };
}
