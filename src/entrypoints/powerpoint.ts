import * as vscode from 'vscode';
import { activateHost } from '../host';
import { EditingProvider } from '../editing';

export function activate(context: vscode.ExtensionContext) {
  const probe = activateHost(context, {
    format: 'pptx', previewId: 'craft.powerpoint.preview', probeId: 'craft.powerpoint.integrationProbe',
  });
  const provider = new EditingProvider(context, { format: 'pptx', engine: 'deck', viewType: 'craft.powerpoint.preview', label: 'PowerPoint presentation' });
  context.subscriptions.push(provider, vscode.window.registerCustomEditorProvider(
    'craft.powerpoint.preview', provider, { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } },
  ));
  return { ...probe, onDidRender: provider.onDidRender, editing: context.extensionMode === vscode.ExtensionMode.Test ? provider : undefined };
}
