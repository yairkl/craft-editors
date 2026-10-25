import * as vscode from 'vscode';
import { activateHost } from '../host';
import { EditingProvider } from '../editing';

export function activate(context: vscode.ExtensionContext) {
  const probe = activateHost(context, {
    format: 'pdf', previewId: 'craft.pdf.preview', probeId: 'craft.pdf.integrationProbe',
  });
  const provider = new EditingProvider(context, { format: 'pdf', engine: 'pdf', viewType: 'craft.pdf.preview', label: 'PDF' });
  context.subscriptions.push(provider, vscode.window.registerCustomEditorProvider(
    'craft.pdf.preview', provider, { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } },
  ));
  return { ...probe, onDidRender: provider.onDidRender, editing: context.extensionMode === vscode.ExtensionMode.Test ? provider : undefined };
}
