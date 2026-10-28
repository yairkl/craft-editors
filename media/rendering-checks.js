// Loaded only in VS Code ExtensionMode.Test; excluded from packaged extensions.
const check = (condition, message) => { if (!condition) throw new Error(message); };
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export async function verifyPreview(viewer, format, canvas, units) {
  await frame();
  if (format === 'csv') {
    check(viewer.sheets().length >= 1, 'CSV session must have a worksheet');
    return { readOnlyVerified: false, resizeVerified: true };
  }
  if (format === 'xlsx') {
    const { verifyNativeTabs } = await import('./editing-checks.js');
    await verifyNativeTabs(viewer, canvas, units);
    const label = viewer.cell_text(0, 0, 0);
    if (label === 'Quarterly overview') {
      // Drive the actual native Ctrl+wheel path with a single wheel notch.
      const { clickCanvas } = await import('./editing-checks.js');
      await clickCanvas(canvas, 350, 300);
      const initialZoom = viewer.zoom_percent();
      const initialToken = viewer.serialize(false).token;
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', code: 'ControlLeft', ctrlKey: true, bubbles: true }));
      await frame();
      const wheel = async (deltaY, deltaMode = 1, ctrlKey = true, x = 350, y = 300) => {
        const bounds = canvas.getBoundingClientRect();
        canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
          clientX: bounds.left + x, clientY: bounds.top + y,
          ctrlKey, deltaMode, deltaY }));
        await new Promise(resolve => setTimeout(resolve, 600));
      };
      await wheel(-1);
      check(viewer.zoom_percent() === initialZoom + 5, `Wheel zoom jumped to ${viewer.zoom_percent()} from ${initialZoom}`);
      await wheel(1);
      check(viewer.zoom_percent() === initialZoom, 'Wheel zoom out did not reverse the fine step');
      await wheel(-0.25); await wheel(-0.25);
      check(viewer.zoom_percent() === initialZoom, 'Partial wheel events must accumulate before stepping');
      await wheel(-0.25);
      check(viewer.zoom_percent() === initialZoom + 5, 'Fractional line input must make one fine step');
      await wheel(-0.25); await wheel(1);
      check(viewer.zoom_percent() === initialZoom, 'Fractional wheel steps must reverse');
      await wheel(-8, 0); // egui's web default: eight logical points per line.
      check(viewer.zoom_percent() === initialZoom + 5, 'Pixel-mode Ctrl+wheel must use the same fine step');
      await wheel(8, 0);
      check(viewer.zoom_percent() === initialZoom, 'Pixel-mode zoom must reverse');
      check(viewer.serialize(false).token === initialToken, 'Adapter zoom must not create a document edit');
      canvas.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', code: 'ControlLeft', bubbles: true }));
      await frame();
      const beforeScroll = [...viewer.cell_bounds(10, 8)];
      await wheel(3, 1, false);
      const afterScroll = [...viewer.cell_bounds(10, 8)];
      check(afterScroll[1] !== beforeScroll[1], 'Ordinary native wheel scrolling must still move the worksheet');
      check(viewer.zoom_percent() === initialZoom, 'Ordinary scrolling must not zoom');
      await wheel(-3, 1, false);
      // Test the native zoom keys without sending synthetic shortcuts to the
      // host, where they can change workbench focus during this renderer test.
      const stopSynthetic = event => { if (!event.isTrusted) event.stopPropagation(); };
      canvas.addEventListener('keydown', stopSynthetic);
      canvas.addEventListener('keyup', stopSynthetic);
      try {
        for (const type of ['keydown', 'keyup']) canvas.dispatchEvent(new KeyboardEvent(type, { key: '=', code: 'Equal', ctrlKey: true, altKey: true, bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 300));
        check(viewer.zoom_percent() === initialZoom + 10, 'Native keyboard zoom must retain its original ten-point step');
        for (const type of ['keydown', 'keyup']) canvas.dispatchEvent(new KeyboardEvent(type, { key: '-', code: 'Minus', ctrlKey: true, altKey: true, bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 300));
        check(viewer.zoom_percent() === initialZoom, 'Native keyboard zoom out must reverse');
        canvas.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', code: 'ControlLeft', bubbles: true }));
        canvas.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', code: 'AltLeft', bubbles: true }));
      } finally {
        canvas.removeEventListener('keydown', stopSynthetic);
        canvas.removeEventListener('keyup', stopSynthetic);
      }
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
  if (format === 'docx' || format === 'pptx' || format === 'svg' || format === 'vectorcraft') {
    check(viewer.text().includes('Craft'), 'Expected document text was not parsed');
    check(units >= 1, 'Document needs visible pages or slides');
    const viewport = document.getElementById('viewport');
    const width = canvas.width; viewport.style.width = '500px';
    await frame(); await frame();
    check(canvas.width !== width, 'Native editor viewport did not resize');
    viewport.style.width = ''; await frame();
    return { readOnlyVerified: false, resizeVerified: true };
  }
  if (format === 'pdf') {
    check(units >= 1, 'PDF needs pages');
    return { readOnlyVerified: false, navigationVerified: false, resizeVerified: true };
  }
  throw new Error('Unsupported preview test format');
}
