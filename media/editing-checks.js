// Development-host browser checks. Never included in a production VSIX.
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
export async function clickCanvas(canvas, x, y) {
  const bounds = canvas.getBoundingClientRect();
  const pointer = (type, buttons) => canvas.dispatchEvent(new PointerEvent(type, {
    bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
    clientX: bounds.left + x, clientY: bounds.top + y, button: 0, buttons,
  }));
  canvas.focus(); pointer('pointermove', 0); await frame();
  pointer('pointerdown', 1); await frame(); pointer('pointerup', 0); await frame();
}
export async function editCell(viewer, canvas, row, col, text) {
  if (!Number.isInteger(row) || !Number.isInteger(col) || typeof text !== 'string' || text.length > 1000) throw new Error('Invalid test cell input.');
  await frame(); await frame();
  const [left, top, right, bottom] = viewer.cell_bounds(row, col);
  await clickCanvas(canvas, (left + right) / 2, (top + bottom) / 2);
  const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', text);
  canvas.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true }));
  await frame(); await frame();
  viewer.commit();
  return viewer.cell_text(viewer.active_sheet(), row, col);
}
export async function verifyNativeTabs(viewer, canvas, units) {
  if (document.getElementById('sheet')) throw new Error('The HTML worksheet dropdown must be removed.');
  const initial = viewer.active_sheet();
  if (units > 1) {
    // Native GridCraft: 26px status bar, 32px worksheet strip. Fixture names
    // Overview/Notes put the first and second tab centers at these logical x's.
    await clickCanvas(canvas, 210, canvas.clientHeight - 42);
    if (viewer.active_sheet() !== 1) throw new Error('Native second worksheet tab did not activate.');
    await clickCanvas(canvas, 125, canvas.clientHeight - 42);
    if (viewer.active_sheet() !== 0) throw new Error('Native first worksheet tab did not activate.');
    await clickCanvas(canvas, initial === 0 ? 125 : 210, canvas.clientHeight - 42);
  }
  if (viewer.active_sheet() !== initial) throw new Error('Native tabs did not restore the saved active sheet.');
}
export async function draftCell(viewer, canvas, row, col, text = '7') {
  await frame(); await frame();
  const [left, top, right, bottom] = viewer.cell_bounds(row, col);
  await clickCanvas(canvas, (left + right) / 2, (top + bottom) / 2);
  canvas.dispatchEvent(new KeyboardEvent('keydown', { key: text, code: text === '=' ? 'Equal' : 'Digit7', bubbles: true }));
  canvas.dispatchEvent(new KeyboardEvent('keyup', { key: text, code: text === '=' ? 'Equal' : 'Digit7', bubbles: true }));
  await frame(); await frame();
}

export async function pasteText(canvas, text) {
  if (typeof text !== 'string' || text.length > 1000) throw new Error('Invalid test input.');
  canvas.focus(); await frame();
  const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', text);
  canvas.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true }));
  await frame(); await frame();
}

export async function historyKey(canvas, redo) {
  canvas.focus(); await frame();
  for (const type of ['keydown', 'keyup']) canvas.dispatchEvent(new KeyboardEvent(type, { key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: redo, bubbles: true }));
  await frame(); await frame();
}

export async function continueDraft(text) {
  const input = document.activeElement;
  if (!(input instanceof HTMLInputElement)) throw new Error('The native text agent lost focus');
  input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
  input.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }));
  await frame(); await frame();
}

export async function editorKey(canvas, key) {
  if (!['Enter', 'ArrowLeft', 'Escape'].includes(key)) throw new Error('Invalid test key');
  const target = document.activeElement || canvas;
  for (const type of ['keydown', 'keyup']) target.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true }));
  await frame(); await frame();
}
