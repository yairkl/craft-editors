import * as vscode from 'vscode';
import { type DocumentFormat } from '../protocol/probe';
import { fileLimit, fileLimitError } from './file-limits';

export class ProbeDocument implements vscode.CustomDocument {
  constructor(readonly uri: vscode.Uri, readonly format: DocumentFormat, readonly bytes: Uint8Array) {}
  dispose(): void { /* No writable state or external resources. */ }
}

export async function readProbeDocument(
  uri: vscode.Uri,
  token: vscode.CancellationToken,
  expectedFormat?: DocumentFormat,
): Promise<ProbeDocument> {
  const format = /\.(xlsx|csv|tsv|md|pdf|docx|pptx|svg|vectorcraft)$/i.exec(uri.path)?.[1]?.toLowerCase() as DocumentFormat | undefined;
  if (!format) throw new Error('Craft supports XLSX, CSV, TSV, Markdown, DOCX, PPTX, PDF, SVG and VectorCraft files.');
  if (expectedFormat && format !== expectedFormat) throw new Error(`This extension supports only ${expectedFormat.toUpperCase()} files.`);
  if (token.isCancellationRequested) throw new vscode.CancellationError();
  const limit = fileLimit(uri);
  const stat = await vscode.workspace.fs.stat(uri);
  if ((stat.type & vscode.FileType.Directory) !== 0) throw new Error('Choose a document file.');
  if (stat.size > limit) throw fileLimitError(limit);
  if (token.isCancellationRequested) throw new vscode.CancellationError();
  const bytes = await vscode.workspace.fs.readFile(uri);
  if (token.isCancellationRequested) throw new vscode.CancellationError();
  // Check again: a file may have grown since stat(). No writes are ever performed.
  if (bytes.byteLength > limit) throw fileLimitError(limit);
  return new ProbeDocument(uri, format, bytes);
}
