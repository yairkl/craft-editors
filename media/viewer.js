/* global acquireVsCodeApi */
const vscode = acquireVsCodeApi();
const sessionId = document.body.dataset.session;
const canvas = document.getElementById('document');
const status = document.getElementById('status');
const sheetSelect = document.getElementById('sheet');
const previous = document.getElementById('previous');
const next = document.getElementById('next');
const zoom = document.getElementById('zoom');
let viewer;
let opened = false;
let capture = false;
let page = 0;
let pages = 0;
let firstResult = true;
const send = (type, fields = {}) => vscode.postMessage({ type, version: 1, sessionId, ...fields });

function fail(failure = '') {
  status.hidden = false;
  status.textContent = 'This document could not be rendered. It may be unsupported or require a password. Your source file has not changed.';
  send('render:failed', capture ? { failure } : {});
}

async function report(width, height, rgba, units) {
  status.hidden = true;
  if (!firstResult) return;
  firstResult = false;
  // Count pixels that differ from the first pixel. This distinguishes real output
  // from an untouched or uniformly cleared canvas, including dark backgrounds.
  let nonBackgroundPixels = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i] !== rgba[0] || rgba[i + 1] !== rgba[1] || rgba[i + 2] !== rgba[2]) nonBackgroundPixels++;
  }
  const result = { width, height, nonBackgroundPixels, units };
  if (capture) {
    const snapshot = document.createElement('canvas');
    snapshot.width = width; snapshot.height = height;
    snapshot.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    result.screenshot = snapshot.toDataURL('image/png');
    try {
      const { verifyPreview } = await import('./rendering-checks.js');
      Object.assign(result, await verifyPreview(viewer, document.body.dataset.format, canvas, units));
    } catch (error) {
      console.error('Rendering regression check failed:', error);
      fail(error instanceof Error ? error.message : 'Browser regression check failed'); return;
    }
  }
  send('render:result', result);
}

function renderPdf() {
  try {
    const pixels = viewer.render(page, Number(zoom.value));
    canvas.width = viewer.width(); canvas.height = viewer.height();
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels), canvas.width, canvas.height), 0, 0);
    document.getElementById('page-label').textContent = `${page + 1} / ${pages}`;
    previous.disabled = page === 0; next.disabled = page + 1 >= pages;
    report(canvas.width, canvas.height, pixels, pages);
  } catch { fail(); }
}

previous.addEventListener('click', () => { if (page > 0) { page--; renderPdf(); } });
next.addEventListener('click', () => { if (page + 1 < pages) { page++; renderPdf(); } });
zoom.addEventListener('change', renderPdf);
sheetSelect.addEventListener('change', () => {
  try { viewer.select_sheet(sheetSelect.selectedIndex); } catch { fail(); }
});

window.addEventListener('message', async ({ data }) => {
  if (!data || data.version !== 1 || data.sessionId !== sessionId) return;
  if (data.type === 'render:timeout') { fail(); return; }
  if (data.type !== 'render:open' || opened || !(data.bytes instanceof ArrayBuffer) ||
      !['xlsx', 'pdf'].includes(data.format)) return;
  opened = true;
  capture = data.capture === true;
  document.body.dataset.format = data.format;
  try {
    const module = await import(document.body.dataset.module);
    await module.default({ module_or_path: document.body.dataset.wasm });
    const bytes = new Uint8Array(data.bytes);
    if (data.format === 'xlsx') {
      viewer = await module.GridViewer.start(canvas, bytes, (width, height, pixels) => {
        report(width, height, pixels, sheetSelect.options.length || 1);
      });
      for (const name of viewer.sheets()) {
        const option = document.createElement('option'); option.textContent = name; sheetSelect.append(option);
      }
      sheetSelect.selectedIndex = viewer.active_sheet();
      document.getElementById('sheet-control').hidden = false;
    } else {
      viewer = new module.PdfViewer(bytes);
      pages = viewer.page_count();
      document.getElementById('pdf-controls').hidden = false;
      renderPdf();
    }
  } catch { fail(); }
});
window.addEventListener('pagehide', () => { viewer?.destroy?.(); viewer?.free?.(); });
send('render:ready');
