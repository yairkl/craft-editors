# Native document editing

Craft Spreadsheets (XLSX/CSV), Craft Documents (DOCX) and Craft Presentations (PPTX) embed their native application interfaces. One shared `EditingProvider` handles VS Code file lifecycle; each entry point supplies only its format, engine directory, editor ID and file-dialog label. The engine adapters implement the same serialize, acknowledgment, history and replace operations. Craft PDF and Craft Vector now use the same host with native editable interfaces. Vector accepts SVG and `.vectorcraft`; Save As keeps the source format. See [the adapter design](decisions/0002-shared-editing-host.md).

GridCraft's worksheet tabs belong to its embedded canvas; VS Code workbench tabs represent files. WordCraft supplies its native document canvas/ribbon, and DeckCraft supplies its native slide canvas/ribbon/thumbnails. No custom host header or Save/Save As buttons appear above these native interfaces.

## Using the editor

Open an XLSX normally, select a cell and type or paste. Use the native bottom tabs to switch, add, rename or manage worksheets. Save with Ctrl/Cmd+S. Use VS Code’s File: Save As command to write an XLSX copy. The embedded spreadsheet has no extra host header or Save buttons. VS Code's undo/redo and File: Revert File commands operate on committed workbook edits. Background serialization preserves the active cell draft, caret, selection and point mode. It saves valid text/formulas without ending entry or accepting autocomplete. Unfinished formulas, validation refusals and active text-box drafts defer saving until the native editor can commit them. Explicit native Save/Enter still commits through the native editor.

## Host lifecycle

Agent integrations reuse the pinned GridCraft, WordCraft, DeckCraft, VectorCraft and PdfCraft MCP servers. The shared MCP transport registers an isolated stdio session with VS Code and Cursor; each adapter chooses a live custom document or a headless WASM session. Live changes enter the existing revision/undo lifecycle. PDF temporarily attaches the live editor session to its automation server for each request and exposes only reviewed in-memory tools. The headless path reads and writes through `workspace.fs`, verifies the source digest before overwriting, and refuses to overwrite an open editor or a file with unsaved text-editor changes. Local file symlink aliases are resolved when checking open documents; custom filesystem providers may have aliases the host cannot resolve. Rich CSV changes require XLSX. If a file is opened while an agent has unsaved headless edits, those edits can still be saved to a different path. The disk digest check is not atomic with the final write. Each extension registers only its own tools.

Embedded engines allow keyboard events to reach the editor's webview keybinding listener, including user-configured shortcuts. Keyboard-triggered undo and redo are handled by the host once; toolbar history commands still delegate to the host. The embedded applications also process keyboard events, so other conflicts between application and host bindings still require platform testing. The owner reported that spreadsheet copy/paste worked on macOS Cursor after the shortcut fix; the platform suite separately tests clipboard shortcuts in VS Code. Broader client and remote combinations still need verification.

`src/editing.ts` is the shared editable custom-document provider for spreadsheets, Word, PowerPoint, PDF and Vector. It reads and writes through `workspace.fs`, so non-file URIs use their filesystem provider. It never accepts arbitrary write destinations from webview messages. File dialogs and document identity belong to VS Code. `src/rpc.ts` correlates requests to one live webview session, rejects disposed requests and bounds response waits.

Each WASM adapter retains native model snapshots for each committed edit. Pending cell and text-box drafts are included in snapshots and mark the document dirty before they are committed. Each edit emits before/after tokens; VS Code receives undo/redo callbacks that restore those snapshots. Worksheet navigation alone does not create a dirty edit. Serializing preserves active cell entry and returns bytes in the document’s registered format plus the exact revision token. Only after a successful filesystem write does the host acknowledge that token as saved. An edit made during the write remains dirty. Failed or cancelled writes do not acknowledge the snapshot.

Before overwriting the original, Save checks that its SHA-256 still matches the baseline. If another program changed it, Save asks the user to use Save As or Revert. This check is not an atomic compare-and-swap: generic filesystem providers cannot guarantee against a concurrent external write between checking and writing. External changes are checked at Save; automatic file watching/reload is not implemented.

Backups store serialized committed document bytes and the original baseline digest in a compact binary format in VS Code's backup location. Recovery restores unsaved content; session undo history is not persisted. Older JSON/base64 backups are still readable, but older extension versions cannot read the new binary backups if the extension is downgraded before recovery. Revert reloads current source bytes and resets the native model. Backup content is not encrypted by this integration.

The host reuses whole byte buffers when sending document data and copies partial views only to avoid exposing unrelated bytes. Rapid edits share one in-flight cache refresh, with another refresh if changes arrive during it. VS Code/webview messaging and WASM ownership still require transfers or copies; document history and crash-recovery state cannot be treated as zero-copy.

Tracked per-program patches add a small service hook for file commands and undo/redo. The native app delegates those commands before its standalone filesystem behavior can run. Standalone title bars and File tabs are hidden because VS Code owns file lifecycle; other native editing controls are enabled. Native AutoSave requests also pass through the host.

## Verification and limits

`npm run test:editing` launches VS Code with the actual WASM engine. Development-only browser helpers click a real cell, paste through native input and type an uncommitted draft. The suite checks formula recalculation, save/reopen, undo/redo, Save As, Revert, write failures, cancellation, edits during a pending write, and recovery. Helpers and test-only inspection APIs are excluded or disabled in production packages.

This is an early editing preview. Automated suites cover generated fixtures on Linux, macOS and Windows, and a Linux-to-container Remote SSH connection; see [platform verification](verification/platform-ci.md) and [SSH verification](verification/remote-ssh.md) for their scope. Content-filled workbook and PDF cases have also been tested on Linux; see [large-file verification](verification/large-files.md). Complex workbook fidelity, charts/images, larger documents, accessibility, WSL and wider SSH scenarios, and full keyboard/IME/clipboard coverage require further validation. Use copies for valuable workbooks until that validation is complete. Snapshots share native document data but remain in memory for the live undo session; broader memory benchmarks and history limits remain open. Legacy `.doc`/`.ppt` registration is not implemented. PDF and vector lifecycle checks run with `npm run test:graphics`. Word/PPTX native text-edit round trips are covered by `npm run test:office`. Advanced host services such as printing, browser file pickers, image clipboard transfer and multiple synchronized views remain outside the validated integration.

WordCraft has a small exact-history snapshot hook so VS Code history can restore native undo/redo state without serializing on each edit. DeckCraft clones its public immutable document state. Shared Rust runner code in `adapters/native/runtime.rs` handles both apps; version-specific egui screenshot behavior stays in each adapter.

DeckCraft's native keyboard path reaches the engine directly. Its adapter delegates undo/redo and standard file shortcuts to VS Code before that path runs, so native shortcuts and workbench commands share one history. The Office suite checks keyboard Undo returns to the clean revision and Redo restores the edit.

## Spreadsheet autosave

Save and backup serialization must not dismiss the native cell editor. Valid drafts are applied to the serialized model while the live editor stays active; this is the same logical revision, so saving does not add a separate undo step. The asynchronous save acknowledgment only marks the written revision saved. Later typing keeps its own revision and remains dirty.

An unfinished formula or draft refused by native validation returns a pending-draft result, which the host treats as cancellation. Autosave leaves both the editor and disk bytes alone and retries after further edits. Active text-box drafts also defer background serialization until their native transaction finishes. Backup serialization follows the same rule: incomplete drafts are not yet included in a successful backup, so finish the edit before relying on recovery for that text.

The regression suite enables actual VS Code after-delay autosave, continues typing in the same cell after a write, pauses inside an unfinished formula, completes it, and reopens the file to verify the value. Both manual host Save and background Save preserve live cell entry.

## VS Code theme synchronization

The bootstrap reads VS Code's webview theme classes on startup and observes live class/theme-ID changes. `set_theme` applies the native light/dark palette in GridCraft, WordCraft and DeckCraft, without changing the document model, editor draft, caret or dirty state. Revert preserves the chosen palette. Word/PPTX page and slide colours remain document content.

High-contrast themes map to the corresponding native light/dark palette; this does not implement full VS Code high-contrast tokens or reproduce arbitrary custom-theme colours. High Contrast Light carries both `vscode-high-contrast-light` and `vscode-high-contrast`; its light class takes precedence. PDF controls already inherit VS Code CSS variables, and PDF page colours are unchanged.

`npm run test:theme` changes actual VS Code themes while native editors are open, checks initial/live palettes, verifies Revert and an active spreadsheet draft, and confirms that tokens, dirty state and source bytes do not change. The test uses isolated profiles and restores their previous theme setting.


PDF uses snapshots of its native object graph, working bytes and in-progress text/form drafts. Host undo restores the graph and draft UI; saves acknowledge only the host revision written. Autosave/backup defer with `DRAFT_PENDING` while a native draft is open, without ending typing. Native Save commits first. A crash before the draft is committed cannot recover its text; this beta limitation also applies to incomplete spreadsheet drafts.

Vector uses native structurally shared document/history snapshots. SVG import/export normalizes XML and has the upstream engine's fidelity limits; native `.vectorcraft` serialization retains the richer model. Save As requires the same extension, avoiding silent format conversion. SVG is an optional visual editor so built-in text workflows stay available.

Native Undo/Redo reveals the current panel with `preserveFocus: true`, preventing the host from dropping the document’s typing focus. Regression checks type directly into the focused native input after history, with no click/refocus helper. All five engines and their UIs receive a pinned Noto Sans Hebrew fallback; Hebrew/niqqud edits and save/reopen are tested in each. Other complex bidi cases remain subject to upstream engine limitations.

Actual Remote SSH render/edit/save/reopen, Undo/Redo, Save As, Revert and backup operations pass for all five apps on a Linux client/container host, including Unicode paths. The closed-panel Revert path updates persisted cache without requiring a live renderer. See [verification scope](verification/remote-ssh.md).

Test input distinguishes replacing a selected cell from continuing an active draft. Replacement checks leave native draft mode through the canvas keyboard path before pasting, so rapid double-click timing cannot turn a replacement into appended text. Dedicated draft/autosave checks retain and exercise the active native text agent.

## CSV sessions and XLSX copies

Value-only CSV edits (including sorting) save in their original format and delimiter. CSV sessions use XLSX for internal cache/backup serialization; source saves explicitly request CSV. Formula, formatting, chart/drawing and extra-sheet edits remain available. A native feature check defers CSV writes while those features exist, keeping the session dirty and the standard close/discard prompt active. A format notice appears only while CSV cannot retain the current changes, explains the loss risk and offers Save as XLSX; it hides again when those features are removed or undone and does not repeatedly interrupt autosave with dialogs.

The copy command and CSV → XLSX Save As serialize the live workbook as XLSX. They do not write or acknowledge the CSV source, and failures/cancellation retain its dirty state. The explicit copy command opens the XLSX as a separate document; discard the CSV session only after keeping the desired workbook copy. Unsupported cross-format conversions remain rejected.
