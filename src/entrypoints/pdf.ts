import * as vscode from 'vscode';
import { activateHost } from '../host';

export function activate(context: vscode.ExtensionContext): ReturnType<typeof activateHost> {
  return activateHost(context, {
    format: 'pdf', previewId: 'craft.pdf.preview', probeId: 'craft.pdf.integrationProbe',
  });
}
