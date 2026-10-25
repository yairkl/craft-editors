# Craft Vector (beta)

Open an SVG or `.vectorcraft` file with **Reopen Editor With… → Craft Vector**. Configure it as the default if desired; SVG text editing stays available.

Uses the native VectorCraft UI, with VS Code Save, Save As (same format), Undo/Redo, Revert and recovery. SVG saves normalize the XML and may change unsupported features. Test on copies of complex artwork. Native `.vectorcraft` keeps the richer model. Dark/light follows VS Code.

Saved SVGs include integrity-checked native editing metadata, so shaped text can remain editable when reopened here even when the portable SVG drawing uses outlines. External SVG changes invalidate that metadata and use normal SVG import.
