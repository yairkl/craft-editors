# Craft Vector (beta)

## Vector tools for agents

Craft Vector includes a bridge for the pinned VectorCraft MCP tools, intended for GitHub Copilot and Cursor. Discovery has been verified in VS Code and Cursor. Enable the Craft Vector server and ask the agent to open an SVG or VectorCraft document by path. Open documents use the live editor model and VS Code undo/save; closed documents use a headless session and are written only when the agent calls `save_file`. Headless saves detect external changes, refuse to overwrite an open editor, and preserve the source format. An unsaved headless session can be recovered to a separate path if its document becomes open. Unsaved changes in an SVG text editor must be saved or closed before the agent opens or saves the same file.

Finish any active drawing interaction before using agent tools. Screenshots returned as image data are available in headless sessions; writing a screenshot to a native path and desktop-only controls are not available. For an open document, use VS Code Save As for a copy. The bridge is tested in a Linux Remote SSH extension host; real-client editing and remote workflows need end-to-end validation.

Open an SVG or `.vectorcraft` file with **Reopen Editor With… → Craft Vector**. Configure it as the default if desired; SVG text editing stays available.

Uses the native VectorCraft UI, with VS Code Save, Save As (same format), Undo/Redo, Revert and recovery. SVG saves normalize the XML and may change unsupported features. Test on copies of complex artwork. Native `.vectorcraft` keeps the richer model. Dark/light follows VS Code.

Saved SVGs include integrity-checked native editing metadata, so shaped text can remain editable when reopened here even when the portable SVG drawing uses outlines. External SVG changes invalidate that metadata and use normal SVG import.

When a headless agent saves to a different path, the destination must not already exist. Choose a new filename to avoid replacing another document.

Files up to 256 MiB are supported by default. Set `craft.vector.maxFileSizeMiB` (up to 1024 MiB) to change the limit. Large or complex documents can use substantially more memory.
