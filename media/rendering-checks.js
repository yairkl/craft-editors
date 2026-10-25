// Loaded only in VS Code ExtensionMode.Test; excluded from packaged extensions.
const check = (condition, message) => { if (!condition) throw new Error(message); };
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export async function verifyPreview(viewer, format, canvas, units) {
  await frame();
  if (format === 'xlsx') {
    const { verifyNativeTabs } = await import('./editing-checks.js');
    await verifyNativeTabs(viewer, canvas, units);
    const label = viewer.cell_text(0, 0, 0);
    if (label === 'Quarterly overview') {
      // Drive the actual native Ctrl+wheel path with a single wheel notch.
      const { clickCanvas } = await import('./editing-checks.js');
      await clickCanvas(canvas, 350, 300);
      const initialZoom = viewer.zoom_percent();
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', code: 'ControlLeft', ctrlKey: true, bubbles: true }));
      await frame();
      const wheel = async deltaY => {
        const bounds = canvas.getBoundingClientRect();
        canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
          clientX: bounds.left + 350, clientY: bounds.top + 300,
          ctrlKey: true, deltaMode: 1, deltaY }));
        await new Promise(resolve => setTimeout(resolve, 600));
      };
      await wheel(-1);
      check(viewer.zoom_percent() === initialZoom + 5, `Wheel zoom jumped to ${viewer.zoom_percent()} from ${initialZoom}`);
      await wheel(1);
      check(viewer.zoom_percent() === initialZoom, 'Wheel zoom out did not reverse the fine step');
      canvas.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', code: 'ControlLeft', bubbles: true }));
      await frame();
    }
    check(['Craft smoke fixture', 'Quarterly overview'].includes(label), 'Expected fixture text was not parsed');
    const input = Number(viewer.cell_text(0, label === 'Quarterly overview' ? 4 : 1, 1));
    check(Number(viewer.cell_text(0, label === 'Quarterly overview' ? 5 : 2, 1)) === input * 2, 'Calculated cell value is wrong');
    // CSS resize must reach the real eframe drawing surface.
    const viewport = document.getElementById('viewport');
    const width = canvas.width;
    viewport.style.width = '500px';
    await frame(); await frame();
    check(canvas.width !== width, 'Grid viewport did not resize');
    viewport.style.width = '';
    await frame();
    return { readOnlyVerified: false, navigationVerified: true, resizeVerified: true };
  }
  if (format === 'docx' || format === 'pptx') {
    check(viewer.text().includes('Craft'), 'Expected document text was not parsed');
    check(units >= 1, 'Document needs visible pages or slides');
    const viewport = document.getElementById('viewport');
    const width = canvas.width; viewport.style.width = '500px';
    await frame(); await frame();
    check(canvas.width !== width, 'Native editor viewport did not resize');
    viewport.style.width = ''; await frame();
    return { readOnlyVerified: false, resizeVerified: true };
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
