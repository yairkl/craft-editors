import * as vscode from 'vscode';
import { activateHost } from '../host';
import { EditingProvider } from '../editing';

export function activate(context: vscode.ExtensionContext) {
  const probe = activateHost(context, {
    format: 'docx', previewId: 'craft.word.preview', probeId: 'craft.word.integrationProbe',
  });
  const provider = new EditingProvider(context, { format: 'docx', engine: 'word', viewType: 'craft.word.preview', label: 'Word document' });
  context.subscriptions.push(provider, vscode.window.registerCustomEditorProvider(
    'craft.word.preview', provider, { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } },
  ));
  return { ...probe, onDidRender: provider.onDidRender, editing: context.extensionMode === vscode.ExtensionMode.Test ? provider : undefined };
}
