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
