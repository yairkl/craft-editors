# Craft PDF (beta)

## PDF tools for agents

Craft PDF includes a bridge for selected PdfCraft MCP tools, intended for GitHub Copilot and Cursor. Discovery by those clients has not yet been verified. Enable the Craft PDF server and ask the agent to open a PDF by path; `doc_open` returns the document id used by subsequent tools. Open PDFs use the live editor model and VS Code undo/save; closed PDFs use a headless session and are written only when the agent calls `doc_save`. Headless saves detect external changes and refuse to overwrite an open editor. Unsaved headless changes can be saved to a separate path if the PDF is opened in the editor.

The exposed tools cover in-memory inspection, page rendering, text, page operations, comments, links, form inspection, and undo/redo. Tools that perform direct file I/O, export, arbitrary command passthrough or multi-document operations are not exposed. Finish an active PDF text or form draft before using agent tools. Password-protected PDFs and PDF-specific save options are not supported by this integration. Use VS Code Save As for a copy of an open PDF. The bridge is tested in a Linux Remote SSH extension host; actual Copilot and Cursor discovery needs end-to-end validation.

View, annotate and edit PDF documents inside VS Code using PdfCraft's native UI. This extension contains only its own renderer and requires no companion extension.

Use the native editing/comment/page tools, with VS Code **Save**, **Save As**, **Undo/Redo**, **Revert** and backup recovery. **Ctrl+mouse wheel** zooms in/out; ordinary wheel scrolling moves through the document. The UI follows VS Code's light/dark theme and has no extra save header.

The beta verifies page rotation and persistence, native keyboard history, viewport zoom and recovery on original synthetic files. It does not guarantee every PdfCraft feature or arbitrary PDF round-trip fidelity. Use copies of valuable files. Password-protected files, signing/printing, external file pickers, combining multiple files and export workflows are outside the validated integration. Live text/form drafts defer autosave and backup until committed; finish them or use explicit native Save before closing. Drafts do not yet survive a process crash.

Desktop VS Code 1.102+, files up to 32 MiB. Linux is tested; Windows/macOS and actual SSH/WSL need beta testing. All processing stays local to the VS Code session. Licenses and notices are included under `notices/`.

PDFs open in the native Read workspace with tool panels closed. Choose an editing tool when needed; normal VS Code saving remains available. This controls the PDF workspace, independently of VS Code temporary preview-tab preferences.

When a headless agent saves to a different path, the destination must not already exist. Choose a new filename to avoid replacing another document.
