import * as vscode from 'vscode';
import { activateHost } from '../host';
import { RenderingProvider } from '../rendering';

export function activate(context: vscode.ExtensionContext) {
  const probe = activateHost(context, {
    format: 'pdf', previewId: 'craft.pdf.preview', probeId: 'craft.pdf.integrationProbe',
  });
  const provider = new RenderingProvider(context, 'pdf');
  context.subscriptions.push(provider, vscode.window.registerCustomEditorProvider(
    'craft.pdf.preview', provider, { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } },
  ));
  return { ...probe, onDidRender: provider.onDidRender };
}
