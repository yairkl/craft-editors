import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { ProbeSession } from '../protocol/probe';
import { ProbeDocument, readProbeDocument } from './document';
import { RenderingProvider, type RenderResult } from './rendering';
import type { DocumentFormat } from '../protocol/probe';

export interface ExtensionDescriptor {
  format: DocumentFormat;
  previewId: string;
  probeId: string;
}

export interface ProbeResult {
  format: 'xlsx' | 'pdf';
  byteLength: number;
  verified: boolean;
}

class ProbeProvider implements vscode.CustomReadonlyEditorProvider<ProbeDocument>, vscode.Disposable {
  private readonly results = new vscode.EventEmitter<ProbeResult>();
  readonly onDidProbe = this.results.event;

  constructor(private readonly extensionUri: vscode.Uri, private readonly format: DocumentFormat) {}

  openCustomDocument(uri: vscode.Uri, _context: vscode.CustomDocumentOpenContext,
    token: vscode.CancellationToken): Promise<ProbeDocument> {
    return readProbeDocument(uri, token, this.format);
  }

  resolveCustomEditor(document: ProbeDocument, panel: vscode.WebviewPanel,
    token: vscode.CancellationToken): void {
    if (token.isCancellationRequested) return;
    const sessionId = randomUUID();
    const session = new ProbeSession(sessionId, {
      byteLength: document.bytes.byteLength,
      sha256: createHash('sha256').update(document.bytes).digest('hex'),
    });
    const media = vscode.Uri.joinPath(this.extensionUri, 'media');
    panel.webview.options = { enableScripts: true, localResourceRoots: [media] };
    let completed = false;
    const finish = (verified: boolean): void => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      this.results.fire({ format: document.format, byteLength: document.bytes.byteLength, verified });
      void panel.webview.postMessage({ type: verified ? 'verified' : 'failed', version: 1, sessionId });
    };
    const timeout = setTimeout(() => finish(false), 30_000);
    const listener = panel.webview.onDidReceiveMessage((value: unknown) => {
      if (completed) return;
      const action = session.accept(value);
      if (action === 'send') {
        // Copy only the document's bytes, never an oversized backing Buffer.
        void panel.webview.postMessage({
          type: 'open', version: 1, sessionId, format: document.format,
          bytes: Uint8Array.from(document.bytes).buffer,
        }).then(delivered => { if (!delivered) finish(false); }, () => finish(false));
      } else if (action === 'verified') finish(true);
      else if (action === 'mismatch') finish(false);
    });
    const cancellation = token.onCancellationRequested(() => {
      completed = true;
      clearTimeout(timeout);
      listener.dispose();
    });
    panel.onDidDispose(() => {
      completed = true;
      clearTimeout(timeout);
      listener.dispose();
      cancellation.dispose();
    });
    panel.webview.html = probeHtml(panel.webview, media, sessionId);
  }

  dispose(): void { this.results.dispose(); }
}

function probeHtml(webview: vscode.Webview, media: vscode.Uri, sessionId: string): string {
  const nonce = randomBytes(24).toString('hex');
  const script = webview.asWebviewUri(vscode.Uri.joinPath(media, 'probe.js'));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(media, 'probe.css'));
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource};">
<link rel="stylesheet" href="${style}"><title>Craft integration probe</title></head>
<body data-session="${sessionId}"><main>
<h1>Craft integration probe</h1>
<p>This development tool checks document transfer. Document viewing and editing are not available yet.</p>
<p id="status" role="status">Connecting to VS Code…</p>
<dl><dt>Format</dt><dd id="format">—</dd><dt>Bytes received</dt><dd id="size">—</dd></dl>
<p>The source file is read only in this probe.</p>
</main><script nonce="${nonce}" src="${script}"></script></body></html>`;
}

export function activateHost(context: vscode.ExtensionContext, descriptor: ExtensionDescriptor): { onDidProbe: vscode.Event<ProbeResult>; onDidRender: vscode.Event<RenderResult> } {
  const provider = new ProbeProvider(context.extensionUri, descriptor.format);
  const rendering = new RenderingProvider(context, descriptor.format);
  context.subscriptions.push(provider, vscode.window.registerCustomEditorProvider(
    descriptor.probeId, provider, { supportsMultipleEditorsPerDocument: false },
  ));
  context.subscriptions.push(rendering, vscode.window.registerCustomEditorProvider(
    descriptor.previewId, rendering, { supportsMultipleEditorsPerDocument: false },
  ));
  return { onDidProbe: provider.onDidProbe, onDidRender: rendering.onDidRender };
}
