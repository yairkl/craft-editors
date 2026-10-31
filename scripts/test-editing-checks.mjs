import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const source = await readFile('media/editing-checks.js', 'utf8');
const { editCell } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
globalThis.requestAnimationFrame = cb => cb();
globalThis.PointerEvent = class { constructor(type) { this.type = type; } };
globalThis.KeyboardEvent = class { constructor(type, options) { this.type = type; this.key = options.key; } };
globalThis.ClipboardEvent = class { constructor(type, options) { this.type = type; this.clipboardData = options.clipboardData; } };
globalThis.DataTransfer = class { setData(_, value) { this.value = value; } };
let value = '42', draft = '7', beforePaste;
const viewer = { draft_text: () => draft, cell_bounds: () => [0, 0, 10, 10], active_sheet: () => 0, cell_text: () => value, commit() {} };
const canvas = { focus() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }), dispatchEvent(event) {
  if (event.type === 'pointerdown' && draft !== null) { value = draft; draft = null; }
  if (event.type === 'keydown' && event.key === 'Escape') draft = null;
  if (event.type === 'paste') { beforePaste = value; value = event.clipboardData.value; }
} };
assert.equal(await editCell(viewer, canvas, 1, 1, '21'), '21');
assert.equal(beforePaste, '42', 'Cell click must not commit the active draft before replacement');
