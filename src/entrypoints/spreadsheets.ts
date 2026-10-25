import * as vscode from 'vscode';
import { activateHost } from '../host';
import { SpreadsheetProvider } from '../editing';

export function activate(context: vscode.ExtensionContext) {
  const probe = activateHost(context, {
    format: 'xlsx', previewId: 'craft.spreadsheets.preview', probeId: 'craft.spreadsheets.integrationProbe',
  });
  const provider = new SpreadsheetProvider(context, 'craft.spreadsheets.preview');
  context.subscriptions.push(provider, vscode.window.registerCustomEditorProvider(
    'craft.spreadsheets.preview', provider, { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } },
  ));
  return { ...probe, onDidRender: provider.onDidRender, editing: context.extensionMode === vscode.ExtensionMode.Test ? provider : undefined };
}
