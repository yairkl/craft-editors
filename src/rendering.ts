import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { DocumentFormat } from '../protocol/probe';

export interface RenderResult {
  format: DocumentFormat;
  rendered: boolean;
  width: number;
  height: number;
  nonBackgroundPixels: number;
  units: number;
  screenshot?: string;
  readOnlyVerified?: boolean;
  navigationVerified?: boolean;
  resizeVerified?: boolean;
  failure?: string;
}

export function renderHtml(webview: vscode.Webview, media: vscode.Uri, engine: vscode.Uri, sessionId: string, editable = false): string {
  const nonce = randomBytes(24).toString('hex');
  const uri = (path: string): vscode.Uri => webview.asWebviewUri(vscode.Uri.joinPath(media, path));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' ${webview.cspSource} 'wasm-unsafe-eval'; style-src ${webview.cspSource}; connect-src ${webview.cspSource}; img-src data: ${webview.cspSource};">
<link rel="stylesheet" href="${uri('viewer.css')}"><title>Craft document</title></head>
<body data-session="${sessionId}" data-module="${webview.asWebviewUri(vscode.Uri.joinPath(engine, 'viewer.js'))}" data-wasm="${webview.asWebviewUri(vscode.Uri.joinPath(engine, 'viewer_bg.wasm'))}">

<aside id="csv-notice" hidden role="status" aria-live="polite" aria-label="CSV format limitations"><span id="csv-message"></span> <button id="csv-workbook" type="button">Save as XLSX…</button></aside>
<p id="status" role="status">Loading renderer…</p><main id="viewport"><canvas id="document" aria-label="${editable ? 'Document editor' : 'Read-only document preview'}"></canvas></main>
<script type="module" nonce="${nonce}" src="${uri('viewer.js')}"></script></body></html>`;
}
