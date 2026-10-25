import * as vscode from 'vscode';
import { MAX_DOCUMENT_BYTES, type DocumentFormat } from '../protocol/probe';

export class ProbeDocument implements vscode.CustomDocument {
  constructor(readonly uri: vscode.Uri, readonly format: DocumentFormat, readonly bytes: Uint8Array) {}
  dispose(): void { /* No writable state or external resources. */ }
}

export async function readProbeDocument(
  uri: vscode.Uri,
  token: vscode.CancellationToken,
  expectedFormat?: DocumentFormat,
): Promise<ProbeDocument> {
  const format = /\.xlsx$/i.test(uri.path) ? 'xlsx' : /\.pdf$/i.test(uri.path) ? 'pdf' : undefined;
  if (!format) throw new Error('Craft supports XLSX and PDF files.');
  if (expectedFormat && format !== expectedFormat) throw new Error(`This extension supports only ${expectedFormat.toUpperCase()} files.`);
  if (token.isCancellationRequested) throw new vscode.CancellationError();
  const stat = await vscode.workspace.fs.stat(uri);
  if ((stat.type & vscode.FileType.Directory) !== 0) throw new Error('Choose a document file.');
  if (stat.size > MAX_DOCUMENT_BYTES) throw new Error('The integration probe supports files up to 32 MiB.');
  if (token.isCancellationRequested) throw new vscode.CancellationError();
  const bytes = await vscode.workspace.fs.readFile(uri);
  if (token.isCancellationRequested) throw new vscode.CancellationError();
  // Check again: a file may have grown since stat(). No writes are ever performed.
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error('The integration probe supports files up to 32 MiB.');
  return new ProbeDocument(uri, format, bytes);
}
