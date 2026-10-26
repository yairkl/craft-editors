# Craft PDF (beta)

View, annotate and edit PDF documents inside VS Code using PdfCraft's native UI. This extension contains only its own renderer and requires no companion extension.

Use the native editing/comment/page tools, with VS Code **Save**, **Save As**, **Undo/Redo**, **Revert** and backup recovery. **Ctrl+mouse wheel** zooms in/out; ordinary wheel scrolling moves through the document. The UI follows VS Code's light/dark theme and has no extra save header.

The beta verifies page rotation and persistence, native keyboard history, viewport zoom and recovery on original synthetic files. It does not guarantee every PdfCraft feature or arbitrary PDF round-trip fidelity. Use copies of valuable files. Password-protected files, signing/printing, external file pickers, combining multiple files and export workflows are outside the validated integration. Live text/form drafts defer autosave and backup until committed; finish them or use explicit native Save before closing. Drafts do not yet survive a process crash.

Desktop VS Code 1.102+, files up to 32 MiB. Linux is tested; Windows/macOS and actual SSH/WSL need beta testing. All processing stays local to the VS Code session. Licenses and notices are included under `notices/`.

PDFs open in the native Read workspace with tool panels closed. Choose an editing tool when needed; normal VS Code saving remains available. This controls the PDF workspace, independently of VS Code temporary preview-tab preferences.
