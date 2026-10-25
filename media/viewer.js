/* global acquireVsCodeApi */
const vscode = acquireVsCodeApi();
const sessionId = document.body.dataset.session;
const canvas = document.getElementById('document');
const status = document.getElementById('status');
let engineReadyResolve;
let engineReadyReject;
const engineReady = new Promise((resolve, reject) => { engineReadyResolve = resolve; engineReadyReject = reject; });
void engineReady.catch(() => {});
const previous = document.getElementById('previous');
const next = document.getElementById('next');
const zoom = document.getElementById('zoom');
let viewer;
let Viewer;
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

previous?.addEventListener('click', () => { if (page > 0) { page--; renderPdf(); } });
next?.addEventListener('click', () => { if (page + 1 < pages) { page++; renderPdf(); } });
zoom?.addEventListener('change', renderPdf);
function hostCommand(command) {
  queueMicrotask(() => {
    try {
      if (['file.save', 'file.saveAs', 'file.close', 'file.new', 'file.open'].includes(command)) viewer.commit();
      send('editor:command', { command });
    } catch {
      status.hidden = false;
      status.textContent = 'Finish or correct the current edit before saving.';
    }
  });
}

window.addEventListener('message', async ({ data }) => {
  if (!data || data.version !== 1 || data.sessionId !== sessionId) return;
  if (data.type === 'editor:request') {
    try {
      await engineReady;
      let result;
      switch (data.operation) {
        case 'serialize': {
          const snapshot = viewer.serialize(data.flush === true);
          result = { token: snapshot.token, bytes: snapshot.bytes.buffer.slice(snapshot.bytes.byteOffset, snapshot.bytes.byteOffset + snapshot.bytes.byteLength) };
          break;
        }
        case 'history': viewer.restore_history(data.token); result = data.token; break;
        case 'ack': viewer.mark_saved(data.token); result = data.token; break;
        case 'restore': result = viewer.replace(new Uint8Array(data.bytes)); break;
        case 'new': result = (Viewer.blank_document ? Viewer.blank_document() : Viewer.blank_document()).buffer; break;
        case 'test:edit': {
          if (!capture) throw new Error('Test operation unavailable.');
          const checks = await import('./editing-checks.js');
          result = await checks.editCell(viewer, canvas, data.row, data.col, data.text);
          break;
        }
        case 'test:draft': {
          if (!capture) throw new Error('Test operation unavailable.');
          const checks = await import('./editing-checks.js');
          await checks.draftCell(viewer, canvas, data.row, data.col);
          result = true; break;
        }
        case 'test:text': {
          if (!capture) throw new Error('Test operation unavailable.');
          result = viewer.text(); break;
        }
        case 'test:history': {
          if (!capture) throw new Error('Test operation unavailable.');
          const checks = await import('./editing-checks.js');
          await checks.historyKey(canvas, data.redo === true); result = true; break;
        }
        case 'test:paste': {
          if (!capture) throw new Error('Test operation unavailable.');
          const checks = await import('./editing-checks.js');
          await checks.pasteText(canvas, data.text);
          result = viewer.text(); break;
        }
        case 'test:cell': {
          if (!capture) throw new Error('Test operation unavailable.');
          result = viewer.cell_text(data.sheet, data.row, data.col); break;
        }
        default: throw new Error('Unsupported document operation.');
      }
      send('editor:response', { requestId: data.requestId, result });
    } catch (error) {
      send('editor:response', { requestId: data.requestId, error: error instanceof Error ? error.message : typeof error === 'string' ? error : 'Document operation failed.' });
    }
    return;
  }
  if (data.type === 'render:timeout') { fail(); return; }
  if (data.type !== 'render:open' || opened || !(data.bytes instanceof ArrayBuffer) ||
      !['xlsx', 'pdf', 'docx', 'pptx'].includes(data.format)) return;
  opened = true;
  capture = data.capture === true;
  document.body.dataset.format = data.format;
  document.body.dataset.editable = String(data.editable === true);
  try {
    const module = await import(document.body.dataset.module);
    await module.default({ module_or_path: document.body.dataset.wasm });
    const bytes = new Uint8Array(data.bytes);
    if (data.format !== 'pdf') {
      Viewer = data.format === 'xlsx' ? module.GridViewer : module.NativeViewer;
      viewer = await Viewer.start(canvas, bytes, (width, height, pixels) => {
        queueMicrotask(() => report(width, height, pixels, data.format === 'xlsx' ? viewer.sheets().length || 1 : viewer.unit_count() || 1));
      }, event => {
        if (event.kind === 'changed') send('editor:changed', { before: event.before, after: event.after, label: event.label });
        else if (event.kind === 'command') hostCommand(event.command);
      });
      if (data.recovered) viewer.mark_original(new Uint8Array(data.originalBytes));
      engineReadyResolve();
    } else {
      viewer = new module.PdfViewer(bytes);
      engineReadyResolve();
      pages = viewer.page_count();
      document.getElementById('pdf-controls').hidden = false;
      renderPdf();
    }
  } catch (error) { engineReadyReject(error); fail(error instanceof Error ? error.message : typeof error === 'string' ? error : 'Renderer startup failed.'); }
});
window.addEventListener('pagehide', () => { viewer?.destroy?.(); viewer?.free?.(); });
send('render:ready');
