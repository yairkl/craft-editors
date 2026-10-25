/* global acquireVsCodeApi */
(() => {
  'use strict';
  const vscode = acquireVsCodeApi();
  const sessionId = document.body.dataset.session;
  const status = document.getElementById('status');
  let opened = false;
  window.addEventListener('message', async ({ data }) => {
    if (!data || data.version !== 1 || data.sessionId !== sessionId) return;
    if (data.type === 'verified') {
      status.textContent = 'Document transfer verified. The Craft rendering engine is not connected yet.';
      return;
    }
    if (data.type === 'failed') {
      status.textContent = 'Document transfer could not be verified. Close this tab and try again.';
      return;
    }
    if (data.type !== 'open' || opened || !(data.bytes instanceof ArrayBuffer) ||
        !['xlsx', 'pdf', 'docx', 'pptx'].includes(data.format)) return;
    opened = true;
    try {
      const hash = await crypto.subtle.digest('SHA-256', data.bytes);
      const sha256 = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
      document.getElementById('format').textContent = data.format.toUpperCase();
      document.getElementById('size').textContent = data.bytes.byteLength.toLocaleString();
      status.textContent = 'Document received. Verifying transfer…';
      vscode.postMessage({ type: 'received', version: 1, sessionId, byteLength: data.bytes.byteLength, sha256 });
    } catch {
      status.textContent = 'Document transfer could not be verified. Close this tab and try again.';
    }
  });
  vscode.postMessage({ type: 'ready', version: 1, sessionId });
})();
