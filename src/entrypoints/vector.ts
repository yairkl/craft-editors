import * as vscode from 'vscode';
import { activateHost } from '../host';
import { EditingProvider } from '../editing';

export function activate(context: vscode.ExtensionContext) {
  const probe = activateHost(context, {
    format: 'svg', previewId: 'craft.vector.preview', probeId: 'craft.vector.integrationProbe',
  });
  const provider = new EditingProvider(context, { format: 'svg', engine: 'vector', viewType: 'craft.vector.preview', label: 'Vector drawing', additionalFormats: ['vectorcraft'] });
  context.subscriptions.push(provider, vscode.window.registerCustomEditorProvider(
    'craft.vector.preview', provider, { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } },
  ));
  return { ...probe, onDidRender: provider.onDidRender, editing: context.extensionMode === vscode.ExtensionMode.Test ? provider : undefined };
}
