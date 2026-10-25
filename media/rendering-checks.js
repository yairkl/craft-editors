// Loaded only in VS Code ExtensionMode.Test; excluded from packaged extensions.
const check = (condition, message) => { if (!condition) throw new Error(message); };
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export async function verifyPreview(viewer, format, canvas, units) {
  await frame();
  if (format === 'xlsx') {
    const signature = viewer.content_signature();
    const label = viewer.cell_text(0, 0, 0);
    check(['Craft smoke fixture', 'Quarterly overview'].includes(label), 'Expected fixture text was not parsed');
    check(viewer.cell_text(0, label === 'Quarterly overview' ? 5 : 2, 1) === '84', 'Calculated cell value is wrong');
    canvas.focus();
    const bounds = canvas.getBoundingClientRect();
    const boundary = label === 'Quarterly overview' ? 185 : 79;
    const pointer = (type, x, buttons) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
      clientX: bounds.left + x, clientY: bounds.top + 10, button: 0, buttons,
    }));
    // Column-resize gestures are real upstream mutation paths even without the ribbon.
    pointer('pointermove', boundary, 0); await frame();
    pointer('pointerdown', boundary, 1); await frame();
    pointer('pointermove', boundary + 60, 1); await frame();
    pointer('pointerup', boundary + 60, 0); await frame();
    for (const type of ['pointerdown', 'pointerup', 'dblclick']) {
      canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 100, clientY: 60, button: 0, buttons: type === 'pointerdown' ? 1 : 0 }));
    }
    for (const key of ['Delete', 'Backspace', 'Enter', 'x']) {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      canvas.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
    }
    canvas.dispatchEvent(new InputEvent('beforeinput', { data: 'overwrite', inputType: 'insertText', bubbles: true }));
    const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', 'overwrite');
    canvas.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true }));
    await frame();
    check(viewer.content_signature() === signature, 'Read-only input changed the workbook');
    if (units > 1) {
      const select = document.getElementById('sheet');
      select.selectedIndex = 1; select.dispatchEvent(new Event('change'));
      await frame();
      check(viewer.active_sheet() === 1, 'Sheet navigation failed');
      check(viewer.cell_text(1, 0, 0) === 'Second worksheet', 'Second sheet content is wrong');
      select.selectedIndex = 0; select.dispatchEvent(new Event('change'));
      await frame();
      check(viewer.active_sheet() === 0, 'Return to first sheet failed');
    }
    check(viewer.content_signature() === signature, 'Navigation changed workbook content');
    // CSS resize must reach the real eframe drawing surface.
    const viewport = document.getElementById('viewport');
    const width = canvas.width;
    viewport.style.width = '500px';
    await frame(); await frame();
    check(canvas.width !== width, 'Grid viewport did not resize');
    viewport.style.width = '';
    await frame();
    return { readOnlyVerified: true, navigationVerified: true, resizeVerified: true };
  }
  const zoom = document.getElementById('zoom');
  const width = canvas.width;
  zoom.value = '1.5'; zoom.dispatchEvent(new Event('change'));
  check(canvas.width > width, 'PDF zoom failed');
  zoom.value = '1'; zoom.dispatchEvent(new Event('change'));
  if (units > 1) {
    const before = canvas.toDataURL();
    document.getElementById('next').click();
    check(document.getElementById('page-label').textContent === '2 / 2', 'Next page failed');
    check(canvas.toDataURL() !== before, 'Second PDF page did not render different content');
    document.getElementById('previous').click();
    check(document.getElementById('page-label').textContent === '1 / 2', 'Previous page failed');
    check(canvas.toDataURL() === before, 'Returning to first PDF page changed its render');
  } else {
    check(document.getElementById('next').disabled && document.getElementById('previous').disabled, 'Single-page navigation must be disabled');
  }
  return { readOnlyVerified: true, navigationVerified: true, resizeVerified: true };
}
