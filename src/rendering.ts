import { randomBytes, randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { readProbeDocument, type ProbeDocument } from './document';
import type { DocumentFormat } from '../protocol/probe';

export interface RenderResult {
  format: 'xlsx' | 'pdf';
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

export class RenderingProvider implements vscode.CustomReadonlyEditorProvider<ProbeDocument>, vscode.Disposable {
  private readonly results = new vscode.EventEmitter<RenderResult>();
  readonly onDidRender = this.results.event;

  constructor(private readonly context: vscode.ExtensionContext, private readonly format: DocumentFormat) {}

  openCustomDocument(uri: vscode.Uri, _context: vscode.CustomDocumentOpenContext,
    token: vscode.CancellationToken): Promise<ProbeDocument> {
    return readProbeDocument(uri, token, this.format);
  }

  async resolveCustomEditor(document: ProbeDocument, panel: vscode.WebviewPanel,
    token: vscode.CancellationToken): Promise<void> {
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    const engine = vscode.Uri.joinPath(media, 'engines', document.format === 'xlsx' ? 'grid' : 'pdf');
    try { await vscode.workspace.fs.stat(vscode.Uri.joinPath(engine, 'viewer_bg.wasm')); }
    catch { throw new Error('Craft renderers are not built. Run npm run renderers:build in the extension source checkout.'); }
    if (token.isCancellationRequested) return;
    const sessionId = randomUUID();
    const capture = this.context.extensionMode === vscode.ExtensionMode.Test;
    panel.webview.options = { enableScripts: true, localResourceRoots: [media] };
    let sent = false;
    let disposed = false;
    let reported = false;
    const fail = (failure?: unknown): void => {
      if (reported || disposed) return;
      reported = true;
      const result: RenderResult = { format: document.format, rendered: false, width: 0, height: 0, nonBackgroundPixels: 0, units: 0 };
      if (capture && typeof failure === 'string') result.failure = failure.slice(0, 500);
      this.results.fire(result);
      void panel.webview.postMessage({ type: 'render:timeout', version: 1, sessionId });
    };
    const timer = setTimeout(fail, 60_000);
    const listener = panel.webview.onDidReceiveMessage((value: unknown) => {
      if (disposed || typeof value !== 'object' || value === null) return;
      const m = value as Record<string, unknown>;
      if (m.version !== 1 || m.sessionId !== sessionId) return;
      if (m.type === 'render:ready' && !sent) {
        sent = true;
        void panel.webview.postMessage({ type: 'render:open', version: 1, sessionId,
          format: document.format, bytes: Uint8Array.from(document.bytes).buffer, capture,
        }).then(delivered => { if (!delivered) fail(); }, fail);
      } else if (m.type === 'render:failed' && sent) {
        clearTimeout(timer);
        fail(m.failure);
      } else if (m.type === 'render:result' && sent && !reported) {
        const { width, height, nonBackgroundPixels, units } = m;
        if (![width, height, nonBackgroundPixels, units].every(v => typeof v === 'number' && Number.isSafeInteger(v)) ||
            typeof width !== 'number' || typeof height !== 'number' || typeof nonBackgroundPixels !== 'number' || typeof units !== 'number' ||
            width < 1 || height < 1 || width * height > 16_000_000 || units < 1 || units > 100_000 ||
            nonBackgroundPixels < 0 || nonBackgroundPixels > width * height) return;
        reported = true;
        clearTimeout(timer);
        const result: RenderResult = { format: document.format, rendered: true, width, height, nonBackgroundPixels, units };
        if (capture && typeof m.screenshot === 'string' && m.screenshot.startsWith('data:image/png;base64,') && m.screenshot.length < 16_000_000) {
          result.screenshot = m.screenshot;
          result.readOnlyVerified = m.readOnlyVerified === true;
          result.navigationVerified = m.navigationVerified === true;
          result.resizeVerified = m.resizeVerified === true;
        }
        this.results.fire(result);
      }
    });
    const cancel = token.onCancellationRequested(() => { disposed = true; clearTimeout(timer); listener.dispose(); });
    panel.onDidDispose(() => { disposed = true; clearTimeout(timer); listener.dispose(); cancel.dispose(); });
    panel.webview.html = renderHtml(panel.webview, media, engine, sessionId);
  }

  dispose(): void { this.results.dispose(); }
}

export function renderHtml(webview: vscode.Webview, media: vscode.Uri, engine: vscode.Uri, sessionId: string, editable = false): string {
  const nonce = randomBytes(24).toString('hex');
  const uri = (path: string): vscode.Uri => webview.asWebviewUri(vscode.Uri.joinPath(media, path));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' ${webview.cspSource} 'wasm-unsafe-eval'; style-src ${webview.cspSource}; connect-src ${webview.cspSource}; img-src data: ${webview.cspSource};">
<link rel="stylesheet" href="${uri('viewer.css')}"><title>Craft preview</title></head>
<body data-session="${sessionId}" data-module="${webview.asWebviewUri(vscode.Uri.joinPath(engine, 'viewer.js'))}" data-wasm="${webview.asWebviewUri(vscode.Uri.joinPath(engine, 'viewer_bg.wasm'))}">
${editable ? '' : `<header><nav id="pdf-controls" hidden aria-label="PDF navigation"><button id="previous" type="button">Previous</button><span id="page-label"></span><button id="next" type="button">Next</button>
<label>Zoom <select id="zoom"><option value="0.75">75%</option><option value="1" selected>100%</option><option value="1.5">150%</option><option value="2">200%</option></select></label></nav></header>`}
<p id="status" role="status">Loading renderer…</p><main id="viewport"><canvas id="document" aria-label="${editable ? 'Spreadsheet editor' : 'Read-only document preview'}"></canvas></main>
<script type="module" nonce="${nonce}" src="${uri('viewer.js')}"></script></body></html>`;
}
