import { realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { MAX_DOCUMENT_BYTES } from '../protocol/probe';
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

/** Reject known-oversized files before loading them, then check for growth. */
export async function readAgentFile(uri: vscode.Uri): Promise<Uint8Array> {
  const stat = await vscode.workspace.fs.stat(uri);
  if ((stat.type & vscode.FileType.Directory) !== 0) throw new Error('Choose a document file.');
  if (stat.size > MAX_DOCUMENT_BYTES) throw new Error('Document exceeds 32 MiB.');
  const bytes = await vscode.workspace.fs.readFile(uri);
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error('Document exceeds 32 MiB.');
  return bytes;
}

/** Publish a new copy without overwriting an existing destination. */
export async function writeNewCopy(target: vscode.Uri, bytes: Uint8Array): Promise<void> {
  const temporary = target.with({ path: `${target.path}.craft-${randomUUID()}.tmp` });
  try {
    await vscode.workspace.fs.writeFile(temporary, bytes);
    await vscode.workspace.fs.rename(temporary, target, { overwrite: false });
  } finally {
    try { await vscode.workspace.fs.delete(temporary); } catch (error) {
      if ((error as { code?: string }).code !== 'FileNotFound') throw error;
    }
  }
}
