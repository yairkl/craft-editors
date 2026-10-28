import * as vscode from 'vscode';

export const DEFAULT_FILE_MIB = 256;
export const MAX_FILE_MIB = 1024;
const MIB = 1024 * 1024;
const editors: Record<string, string> = {
  xlsx: 'spreadsheets', csv: 'spreadsheets', docx: 'word', pptx: 'powerpoint',
  pdf: 'pdf', svg: 'vector', vectorcraft: 'vector',
};

/** Resolve the file limit for the editor and remote/workspace resource. */
export function fileLimit(uri: vscode.Uri): number {
  const extension = uri.path.split('.').pop()?.toLowerCase() ?? '';
  const editor = editors[extension];
  const configured = editor ? vscode.workspace.getConfiguration(`craft.${editor}`, uri).get<number>('maxFileSizeMiB', DEFAULT_FILE_MIB) : DEFAULT_FILE_MIB;
  const mib = Number.isFinite(configured) ? Math.max(1, Math.min(MAX_FILE_MIB, Math.floor(configured))) : DEFAULT_FILE_MIB;
  return mib * MIB;
}

export function fileLimitError(limit: number): Error {
  return new Error(`Document exceeds the configured ${limit / MIB} MiB file size limit. Adjust the Craft editor's maxFileSizeMiB setting (maximum ${MAX_FILE_MIB} MiB) and try again.`);
}
