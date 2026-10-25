import * as vscode from 'vscode';
import { activateHost } from '../host';

export function activate(context: vscode.ExtensionContext): ReturnType<typeof activateHost> {
  return activateHost(context, {
    format: 'xlsx', previewId: 'craft.spreadsheets.preview', probeId: 'craft.spreadsheets.integrationProbe',
  });
}
