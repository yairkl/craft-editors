import { realpath } from 'node:fs/promises';
import * as vscode from 'vscode';
import { EditableDocument, EditingProvider } from './editing';

/** Compare existing local/remote-host files by real path, including symlink aliases. */
export async function sameResource(a: vscode.Uri, b: vscode.Uri): Promise<boolean> {
  if (a.toString() === b.toString()) return true;
  if (a.scheme !== 'file' || b.scheme !== 'file') return false;
  try {
    const [left, right] = await Promise.all([realpath(a.fsPath), realpath(b.fsPath)]);
    return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
  } catch { return false; }
}

export async function findLive(provider: EditingProvider, uri: vscode.Uri): Promise<EditableDocument | undefined> {
  const direct = provider.getDocument(uri);
  if (direct) return direct;
  for (const doc of provider.getDocuments()) if (await sameResource(uri, doc.uri)) return doc;
  return undefined;
}

export async function hasDirtyText(uri: vscode.Uri): Promise<boolean> {
  for (const doc of vscode.workspace.textDocuments) if (doc.isDirty && await sameResource(uri, doc.uri)) return true;
  return false;
}
