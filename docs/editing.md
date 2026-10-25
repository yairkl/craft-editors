# Spreadsheet editing

Craft Spreadsheets 0.0.2 uses GridCraft's existing native ribbon, formula bar, grid, worksheet tabs and dialogs. These controls are enabled. The tabs are native to GridCraft's embedded canvas; VS Code's workbench tabs represent files, so they are not reused for individual worksheets. Craft PDF remains read only.

## Using the editor

Open an XLSX normally, select a cell and type or paste. Use the native bottom tabs to switch, add, rename or manage worksheets. Save with Ctrl/Cmd+S or the host Save button. Save As writes an XLSX copy. VS Code's undo/redo and File: Revert File commands operate on committed workbook edits. Pending cell and text-box drafts are committed before serialization; invalid drafts prevent saving.

## Host lifecycle

`src/editing.ts` is the editable custom-document provider. It reads and writes through `workspace.fs`, so non-file URIs use their filesystem provider. It never accepts arbitrary write destinations from webview messages. File dialogs and document identity belong to VS Code. `src/rpc.ts` correlates requests to one live webview session, rejects disposed requests and bounds response waits.

The WASM adapter retains immutable workbook snapshots for each committed edit. Pending cell and text-box drafts are included in snapshots and mark the document dirty before they are committed. Each edit emits before/after tokens; VS Code receives undo/redo callbacks that restore those snapshots. Worksheet navigation alone does not create a dirty edit. Serializing commits drafts and returns XLSX bytes plus the exact revision token. Only after a successful filesystem write does the host acknowledge that token as saved. An edit made during the write remains dirty. Failed or cancelled writes do not acknowledge the snapshot.

Before overwriting the original, Save checks that its SHA-256 still matches the baseline. If another program changed it, Save asks the user to use Save As or Revert. This check is not an atomic compare-and-swap: generic filesystem providers cannot guarantee against a concurrent external write between checking and writing. External changes are checked at Save; automatic file watching/reload is not implemented.

Backups store serialized committed XLSX bytes and the original baseline digest in VS Code's backup location. Recovery restores unsaved content; session undo history is not persisted. Revert reloads current source bytes and resets the native model. Backup content is not encrypted by this integration.

The tracked GridCraft patch adds a small service hook for file commands and undo/redo. The native app delegates those commands before its standalone filesystem behavior can run. Its title bar and File tab are hidden because VS Code owns file lifecycle; other native editing controls are enabled. Native AutoSave requests also pass through the host.

## Verification and limits

`npm run test:editing` launches VS Code with the actual WASM engine. Development-only browser helpers click a real cell, paste through native input and type an uncommitted draft. The suite checks formula recalculation, save/reopen, undo/redo, Save As, Revert, write failures, cancellation, edits during a pending write, and recovery. Helpers and test-only inspection APIs are excluded or disabled in production packages.

This is an early editing preview. Generated fixtures on Linux and a simulated remote filesystem are covered. Complex workbook fidelity, charts/images, large documents, accessibility, Windows/macOS, actual SSH/WSL, and full keyboard/IME/clipboard coverage require further validation. Use copies for valuable workbooks until that validation is complete. Immutable snapshots share workbook data but remain in memory for the live undo session; memory benchmarks and history limits remain open. No DOCX/PPTX or PDF editing is implemented.
